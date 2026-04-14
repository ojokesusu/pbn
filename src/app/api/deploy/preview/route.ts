import { NextResponse } from "next/server";
import { generateSite } from "@/lib/generator";

// POST /api/deploy/preview - Generate site preview (returns generated files)
export async function POST(request: Request) {
  try {
    const { domainId } = await request.json();

    if (!domainId) {
      return NextResponse.json({ error: "domainId is required" }, { status: 400 });
    }

    const { files } = await generateSite(domainId);

    // Return the index.html for preview with CSS inlined
    const indexFile = files.find((f) => f.path === "index.html");
    const cssFile = files.find((f) => f.path === "assets/style.css");

    // Inline CSS into HTML so the preview iframe renders styles correctly
    let previewHtml = indexFile?.content || "";
    if (cssFile && previewHtml) {
      previewHtml = previewHtml.replace(
        '<link rel="stylesheet" href="/assets/style.css">',
        `<style>${cssFile.content}</style>`
      );
    }

    return NextResponse.json({
      files: files.map((f) => ({ path: f.path, size: f.content.length })),
      preview: previewHtml,
      totalFiles: files.length,
    });
  } catch (error) {
    console.error("Preview error:", error);
    const message = error instanceof Error ? error.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
