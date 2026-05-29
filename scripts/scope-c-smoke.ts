/**
 * Scope C end-to-end smoke test.
 *
 * Validates the provisioning pipeline without touching a real VPS:
 *   1. Insert a ProvisionBatch + 1 ProvisionTask pointing at an unreachable IP.
 *   2. Poll the task every 5s for up to 120s.
 *   3. Expect the worker daemon to pick it up and transition it to "failed"
 *      with a non-empty errorMessage (install can't reach 10.255.255.1).
 *   4. Clean up the batch + task on the way out.
 *
 * Exit codes:
 *   0  -> task ended in "failed" (expected outcome for unreachable host)
 *   1  -> any other outcome (timeout, unexpected status, DB error, etc.)
 *
 * Run with:  npx tsx scripts/scope-c-smoke.ts
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes, createCipheriv } from "node:crypto";

const FAKE_HOST = "10.255.255.1";
const FAKE_PASSWORD = "smoke-test-not-a-real-secret";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;

function encryptPassword(plain: string): string {
  const keyHex = process.env.PROVISION_PASSWORD_KEY;
  if (keyHex && /^[0-9a-fA-F]{64}$/.test(keyHex)) {
    // AES-256-GCM with a 32-byte key supplied via hex env var.
    const key = Buffer.from(keyHex, "hex");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
  }
  // Match the current app behaviour (src/app/api/provisioning/batches/route.ts)
  // which only base64-obfuscates when no key is configured.
  return Buffer.from(plain, "utf8").toString("base64");
}

function suffix(): string {
  // crypto.randomUUID is fine here since this is a one-shot script,
  // not workflow code where determinism matters.
  return randomBytes(4).toString("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  const batchName = `smoke-scope-c-${suffix()}`;
  let batchId: string | null = null;
  let taskId: string | null = null;

  try {
    console.log(`[smoke] creating batch "${batchName}" with 1 fake target ${FAKE_HOST}`);

    const batch = await prisma.provisionBatch.create({
      data: {
        name: batchName,
        provider: "smoke",
        region: "smoke",
        tier: "smoke",
        totalTargets: 1,
        pendingCount: 1,
        status: "pending",
        createdBy: "scope-c-smoke",
      },
    });
    batchId = batch.id;
    console.log(`[smoke] batch id: ${batchId}`);

    const task = await prisma.provisionTask.create({
      data: {
        batchId: batch.id,
        label: `smoke-${suffix()}`,
        host: FAKE_HOST,
        sshUser: "root",
        sshPassEnc: encryptPassword(FAKE_PASSWORD),
        provider: "smoke",
        region: "smoke",
        tier: "smoke",
        status: "pending",
      },
    });
    taskId = task.id;
    console.log(`[smoke] task id: ${taskId}`);

    console.log(`[smoke] polling every ${POLL_INTERVAL_MS / 1000}s for up to ${POLL_TIMEOUT_MS / 1000}s...`);
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let lastStatus = "pending";
    let everLeftPending = false;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const current = await prisma.provisionTask.findUnique({ where: { id: task.id } });
      if (!current) {
        console.error(`[smoke] task ${task.id} disappeared from DB`);
        return 1;
      }
      if (current.status !== lastStatus) {
        console.log(`[smoke] status ${lastStatus} -> ${current.status} (step="${current.currentStep}")`);
        lastStatus = current.status;
      }
      if (current.status !== "pending") {
        everLeftPending = true;
      }
      if (current.status === "failed") {
        const errMsg = current.errorMessage?.trim() ?? "";
        if (!errMsg) {
          console.error(`[smoke] task failed but errorMessage is empty -- worker did not record cause`);
          return 1;
        }
        console.log(`[smoke] task failed as expected. errorMessage: ${errMsg}`);
        return 0;
      }
      if (current.status === "completed") {
        console.error(`[smoke] task unexpectedly completed against unreachable host ${FAKE_HOST}`);
        return 1;
      }
    }

    if (!everLeftPending) {
      console.warn(
        `[smoke] WARNING: task stayed "pending" for ${POLL_TIMEOUT_MS / 1000}s. ` +
          `The provisioning worker daemon is likely not running.`,
      );
    } else {
      console.error(`[smoke] timed out with status "${lastStatus}" -- expected "failed"`);
    }
    return 1;
  } catch (err) {
    console.error(`[smoke] fatal error:`, err);
    return 1;
  } finally {
    try {
      if (taskId) {
        await prisma.provisionTask.deleteMany({ where: { id: taskId } });
        console.log(`[smoke] cleaned up task ${taskId}`);
      }
      if (batchId) {
        await prisma.provisionBatch.deleteMany({ where: { id: batchId } });
        console.log(`[smoke] cleaned up batch ${batchId}`);
      }
    } catch (cleanupErr) {
      console.error(`[smoke] cleanup error:`, cleanupErr);
    }
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[smoke] unhandled:`, err);
    process.exit(1);
  });
