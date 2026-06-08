// ── Deploy a single domain — shared by single + bulk deploy endpoints ──

import { prisma } from "@/lib/db";
import { generateSite } from "@/lib/generator";
import { deployVisFtp } from "@/lib/ftp";
import { submitToIndexNow } from "@/lib/google-ping";
import { ensureThemeForDomain } from "@/lib/theme-engine";

export interface DeployResult {
  domainId: string;
  url: string;
  status: "success" | "failed";
  filesDeployed: number;
  message: string;
  error?: string;
  durationMs: number;
}

export async function deployDomain(domainId: string): Promise<DeployResult> {
  const start = Date.now();

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: { server: true },
  });

  if (!domain) {
    return {
      domainId,
      url: "",
      status: "failed",
      filesDeployed: 0,
      message: "Domain not found",
      error: "Domain not found",
      durationMs: Date.now() - start,
    };
  }

  // Adult-quarantine guard: never push files to adult domains.
  if ((domain as { isAdult?: boolean }).isAdult) {
    return {
      domainId,
      url: domain.url,
      status: "failed",
      filesDeployed: 0,
      message: "Skipped: adult domain quarantined",
      error: "adult_quarantine",
      durationMs: Date.now() - start,
    };
  }

  // Belt-and-braces guard: if the domain still has no theme (legacy / freshly
  // provisioned), spin one up now so generateSite() never crashes on a null
  // theme.id. Idempotent — no-op when themeId already set.
  if (!domain.themeId) {
    await ensureThemeForDomain(domain.id, domain.genre, "deploy");
  }

  // Create deploy log entry
  const deployLog = await prisma.deployLog.create({
    data: {
      domainId,
      action: "deploy",
      status: "in-progress",
      message: "Generating site...",
    },
  });

  try {
    // Generate the static site
    const { files } = await generateSite(domainId);

    if (!domain.server?.host || !domain.server?.username || !domain.server?.password) {
      await prisma.deployLog.update({
        where: { id: deployLog.id },
        data: {
          status: "success",
          filesChanged: files.length,
          message: `Generated ${files.length} files locally (no FTP configured)`,
        },
      });
      return {
        domainId,
        url: domain.url,
        status: "success",
        filesDeployed: files.length,
        message: "Generated locally (no FTP)",
        durationMs: Date.now() - start,
      };
    }

    // Determine FTP remote path.
    // cPanel-style: per-domain FTP user, /public_html is the docroot.
    // Shared server (e.g. Contabo + Pure-FTPd): one FTP user, vhosts at /{domain}.
    const domainName = domain.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const isCPanelStyle = domainName.includes(domain.server.username);
    const remotePath = isCPanelStyle ? "/public_html" : `/${domainName}`;

    await prisma.deployLog.update({
      where: { id: deployLog.id },
      data: { message: "Uploading files via FTP..." },
    });

    const result = await deployVisFtp(
      {
        host: domain.server.host,
        user: domain.server.username,
        password: domain.server.password,
        port: domain.server.port,
      },
      files,
      remotePath
    );

    if (result.success) {
      await prisma.deployLog.update({
        where: { id: deployLog.id },
        data: {
          status: "success",
          filesChanged: result.filesUploaded,
          message: `Deployed ${result.filesUploaded} files`,
        },
      });
      await prisma.domain.update({
        where: { id: domainId },
        data: { lastDeployed: new Date() },
      });

      // IndexNow ping to Bing/Yandex — logged in DeployLog, visible in Google Ping page
      try {
        const result = await submitToIndexNow(domainId);
        if (!result.success) {
          console.warn(`[deploy] IndexNow non-success for ${domainId}: ${result.message ?? ""}`);
        }
      } catch (err) {
        // IndexNow itself caught all errors internally; this is a defense.
        console.warn(`[deploy] IndexNow threw for ${domainId}`, err);
      }

      return {
        domainId,
        url: domain.url,
        status: "success",
        filesDeployed: result.filesUploaded,
        message: `${result.filesUploaded} files uploaded + IndexNow pinged`,
        durationMs: Date.now() - start,
      };
    } else {
      await prisma.deployLog.update({
        where: { id: deployLog.id },
        data: { status: "failed", message: result.error || "FTP upload failed" },
      });
      return {
        domainId,
        url: domain.url,
        status: "failed",
        filesDeployed: 0,
        message: result.error || "FTP upload failed",
        error: result.error,
        durationMs: Date.now() - start,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.deployLog.update({
      where: { id: deployLog.id },
      data: { status: "failed", message: message.substring(0, 500) },
    });
    return {
      domainId,
      url: domain.url,
      status: "failed",
      filesDeployed: 0,
      message: message.substring(0, 200),
      error: message,
      durationMs: Date.now() - start,
    };
  }
}
