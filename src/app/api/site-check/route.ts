import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/site-check — Check deployed sites for CSS/style integrity
export async function POST() {
  try {
    const deployed = await prisma.domain.findMany({
      where: { lastDeployed: { not: null } },
      select: {
        id: true,
        url: true,
        name: true,
        theme: { select: { cssPrefix: true, layoutName: true, isGenerated: true, generatedCss: true } },
      },
    });

    const results = [];
    let ok = 0, broken = 0, errors = 0;

    for (const d of deployed) {
      let status: "ok" | "broken" | "error" = "ok";
      let message = "";
      let hasStyle = false;
      let hasCssPrefix = false;
      let hasTitle = false;
      let httpStatus = 0;

      // Check theme in DB
      if (!d.theme) {
        status = "broken";
        message = "Tidak ada tema";
      } else if (!d.theme.isGenerated || !d.theme.generatedCss || d.theme.generatedCss.length < 100) {
        status = "broken";
        message = "CSS tidak di-generate";
      }

      // Check live site
      try {
        const res = await fetch(d.url, { signal: AbortSignal.timeout(10000), redirect: "follow" });
        httpStatus = res.status;
        const html = await res.text();
        hasStyle = html.includes("<style>") || html.includes("style.css");
        hasCssPrefix = d.theme?.cssPrefix ? html.includes(d.theme.cssPrefix) : false;
        hasTitle = html.includes("<title>");

        if (!hasStyle && !hasCssPrefix) {
          status = "broken";
          message = "CSS tidak ditemukan di halaman";
        } else if (!hasCssPrefix && d.theme?.cssPrefix) {
          status = "broken";
          message = "CSS prefix tidak cocok";
        }
      } catch (err) {
        status = "error";
        message = err instanceof Error ? err.message.substring(0, 100) : "Network error";
      }

      if (status === "ok") ok++;
      else if (status === "broken") broken++;
      else errors++;

      results.push({
        domainId: d.id,
        url: d.url,
        name: d.name,
        layout: d.theme?.layoutName || "none",
        status,
        httpStatus,
        hasStyle,
        hasCssPrefix,
        hasTitle,
        message,
      });
    }

    return NextResponse.json({
      total: deployed.length,
      ok,
      broken,
      errors,
      results,
    });
  } catch (error) {
    console.error("Site check error:", error);
    return NextResponse.json({ error: "Site check failed" }, { status: 500 });
  }
}
