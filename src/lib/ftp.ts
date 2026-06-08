import * as ftp from "basic-ftp";
import path from "path";
import { Readable } from "stream";

interface FtpConfig {
  host: string;
  user: string;
  password: string;
  port?: number;
  secure?: boolean;
}

interface UploadFile {
  path: string;
  content: string;
}

async function connect(client: ftp.Client, config: FtpConfig): Promise<void> {
  const port = config.port || 21;

  // Strategy 1: Try explicit FTPS (AUTH TLS on port 21) — most common
  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      port,
      secure: true,
      secureOptions: { rejectUnauthorized: false, minVersion: "TLSv1.2" as const },
    });
    return;
  } catch (err1) {
    const msg1 = err1 instanceof Error ? err1.message : "";

    // Strategy 2: Try non-secure (plain FTP)
    // Skip if the server explicitly said it requires TLS
    if (!msg1.includes("421") && !msg1.includes("cleartext") && !msg1.includes("TLS")) {
      try {
        await client.access({
          host: config.host,
          user: config.user,
          password: config.password,
          port,
          secure: false,
        });
        return;
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : "";

        // If non-secure also fails with TLS requirement, try secure with looser options
        if (msg2.includes("421") || msg2.includes("cleartext") || msg2.includes("TLS")) {
          await client.access({
            host: config.host,
            user: config.user,
            password: config.password,
            port,
            secure: true,
            secureOptions: {
              rejectUnauthorized: false,
              minVersion: "TLSv1" as const,
              ciphers: "ALL",
            },
          });
          return;
        }
        throw err2;
      }
    }

    // Strategy 3: Server requires TLS but first attempt failed — try with looser TLS options
    try {
      await client.access({
        host: config.host,
        user: config.user,
        password: config.password,
        port,
        secure: true,
        secureOptions: {
          rejectUnauthorized: false,
          minVersion: "TLSv1" as const,
          ciphers: "ALL",
        },
      });
      return;
    } catch {
      // Strategy 4: Try implicit FTPS on port 990
      try {
        await client.access({
          host: config.host,
          user: config.user,
          password: config.password,
          port: 990,
          secure: true,
          secureOptions: { rejectUnauthorized: false },
        });
        return;
      } catch {
        // All strategies failed — throw the original TLS error
        throw err1;
      }
    }
  }
}

// Wrap a promise with a hard timeout — rejects if not done within ms
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function uploadFileWithRetry(
  client: ftp.Client,
  fileName: string,
  content: string,
  maxRetries = 2
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const stream = Readable.from(Buffer.from(content, "utf-8"));
      // Hard 30-second per-file timeout — bad servers can't hang us
      await withTimeout(
        client.uploadFrom(stream, fileName),
        30_000,
        `upload ${fileName}`
      );
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function doDeployFtp(
  config: FtpConfig,
  files: UploadFile[],
  remotePath: string
): Promise<{ success: boolean; filesUploaded: number; error?: string }> {
  const maxConnectionRetries = 2;
  let lastError: string = "";

  for (let connAttempt = 1; connAttempt <= maxConnectionRetries; connAttempt++) {
    // 90s idle timeout — Rumahweb shared hosting PASV handshake can stall longer
    // than the previous 45s on the first attempt right after AddSite provisioning.
    // allowSeparateTransferHost lets the data connection land on whatever IP the
    // PASV response advertises (some shared hosts return a different LB backend
    // for data) instead of forcing the control-host IP, which can drop traffic.
    const client = new ftp.Client(90000);
    client.ftp.verbose = false;
    (client as unknown as { _ftpOptions?: { allowSeparateTransferHost?: boolean } })._ftpOptions = { allowSeparateTransferHost: true };

    try {
      await connect(client, config);
      await client.ensureDir(remotePath);

      // Group files by directory
      const filesByDir = new Map<string, UploadFile[]>();
      for (const file of files) {
        const dir = path.posix.dirname(file.path);
        if (!filesByDir.has(dir)) filesByDir.set(dir, []);
        filesByDir.get(dir)!.push(file);
      }

      let filesUploaded = 0;

      for (const [relDir, dirFiles] of filesByDir) {
        await client.cd(remotePath);
        if (relDir && relDir !== "." && relDir !== "/") {
          await client.ensureDir(relDir);
        }
        for (const file of dirFiles) {
          const fileName = path.posix.basename(file.path);
          await uploadFileWithRetry(client, fileName, file.content);
          filesUploaded++;
        }
      }

      client.close();
      return { success: true, filesUploaded };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown FTP error";
      try { client.close(); } catch {}

      // Classify so we know whether to retry and how to tag the final error.
      const isControlTimeout = /Timeout \(control socket\)|Timeout \(data socket\)|Timeout when trying to open data connection/i.test(lastError);
      const isNetworkDrop = lastError.includes("ETIMEDOUT") || lastError.includes("ECONNRESET") || lastError.includes("EPIPE") || lastError.includes("ECONNREFUSED");
      const is530Auth = /530\b/.test(lastError) || /Login authentication failed/i.test(lastError);
      const isTlsErr = /TLS|certificate|SSL|wrong version number/i.test(lastError);

      if (connAttempt < maxConnectionRetries) {
        if (isControlTimeout || isNetworkDrop) {
          // PASV / NAT path stall — back off briefly and reconnect.
          await new Promise(resolve => setTimeout(resolve, 2500));
          continue;
        }
        if (is530Auth) {
          // Right after AddSite, cPanel can take a few seconds to push the new
          // FTP user into PAM. 6s sleep covers the propagation window observed
          // in the 2026-06-07 16:37–17:08 UTC Rumahweb cluster (3 servers all
          // recovered to non-530 on the next cycle).
          await new Promise(resolve => setTimeout(resolve, 6000));
          continue;
        }
      }

      // Tag the final error for fast triage in deploy-error-diagnose.
      const tag = is530Auth ? "[AUTH]" : isTlsErr ? "[TLS]" : (isControlTimeout || isNetworkDrop) ? "[NET]" : "[FTP]";
      return { success: false, filesUploaded: 0, error: `${tag} ${lastError}` };
    }
  }

  return { success: false, filesUploaded: 0, error: lastError };
}

export async function deployVisFtp(
  config: FtpConfig,
  files: UploadFile[],
  remotePath: string = "/public_html"
): Promise<{ success: boolean; filesUploaded: number; error?: string }> {
  // Hard 4-minute total deploy timeout per site — bad servers can't hang the bulk deploy
  try {
    return await withTimeout(
      doDeployFtp(config, files, remotePath),
      4 * 60 * 1000,
      "whole FTP deploy"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, filesUploaded: 0, error: message };
  }
}

export async function testFtpConnection(config: FtpConfig): Promise<{ success: boolean; error?: string }> {
  const client = new ftp.Client(15000);
  client.ftp.verbose = false;

  try {
    await connect(client, config);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown FTP error";
    return { success: false, error: message };
  } finally {
    client.close();
  }
}
