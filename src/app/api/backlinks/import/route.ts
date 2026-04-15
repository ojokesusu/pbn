import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json();
    const { csv } = body;

    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { error: "CSV data is required" },
        { status: 400 }
      );
    }

    const lines = csv
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    if (lines.length === 0) {
      return NextResponse.json(
        { error: "CSV is empty" },
        { status: 400 }
      );
    }

    // Detect if first line is a header
    const firstLine = lines[0].toLowerCase();
    const hasHeader =
      firstLine.includes("anchor") || firstLine.includes("url") || firstLine.includes("text");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const created: { anchorText: string; targetUrl: string }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      // Support comma or semicolon separator
      const separator = line.includes(";") ? ";" : ",";
      const parts = line.split(separator).map((p: string) => p.trim().replace(/^["']|["']$/g, ""));

      // Support both formats:
      // 1. anchor_text, target_url  (2 columns)
      // 2. target_url               (1 column — auto anchor)
      if (parts.length === 1) {
        const targetUrl = parts[0];
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          errors.push(`Line ${i + 1}: invalid URL "${targetUrl}"`);
          continue;
        }
        created.push({ anchorText: "", targetUrl });
        continue;
      }

      const [anchorText, targetUrl] = parts;

      if (!targetUrl) {
        errors.push(`Line ${i + 1}: target_url is empty`);
        continue;
      }

      // Basic URL validation
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        errors.push(`Line ${i + 1}: invalid URL "${targetUrl}"`);
        continue;
      }

      created.push({ anchorText: anchorText ?? "", targetUrl });
    }

    // Bulk create
    if (created.length > 0) {
      await prisma.backlink.createMany({
        data: created.map((item) => ({
          anchorText: item.anchorText,
          targetUrl: item.targetUrl,
          status: "active",
        })),
      });
    }

    return NextResponse.json({
      message: `Imported ${created.length} backlinks`,
      imported: created.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Failed to import backlinks:", error);
    return NextResponse.json(
      { error: "Failed to import backlinks" },
      { status: 500 }
    );
  }
}
