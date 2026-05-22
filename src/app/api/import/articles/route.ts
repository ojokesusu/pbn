import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 200);
}

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim().replace(/[\r\n]+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let buffer: Buffer;
    let action: string;

    if (contentType.startsWith("application/octet-stream") || contentType.includes("spreadsheet")) {
      // Raw binary upload — bypass FormData parsing limit (Next.js multipart caps at ~4MB)
      buffer = Buffer.from(await req.arrayBuffer());
      action = req.headers.get("x-action") ?? "import";
    } else {
      // FormData fallback (legacy / small files)
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      action = (formData.get("action") as string) ?? "import";
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
      buffer = Buffer.from(await file.arrayBuffer());
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // Sanity-check ZIP signature (XLSX = OOXML zip container). First 4 bytes should be 50 4B 03 04 ("PK..").
    const sig = buffer.subarray(0, 4).toString("hex").toLowerCase();
    if (!sig.startsWith("504b")) {
      return NextResponse.json({
        error: `File bukan XLSX valid (header ${sig}, expected 504b...). Size ${buffer.length} bytes. Cek file tidak rusak / format benar.`,
      }, { status: 400 });
    }

    const wb = XLSX.read(buffer, { type: "buffer" });

    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === "articles");
    if (!sheetName) {
      return NextResponse.json({ error: 'Sheet "Articles" not found in XLSX' }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
    if (rows.length === 0) {
      return NextResponse.json({ error: "Articles sheet is empty" }, { status: 400 });
    }

    // Expected columns: Domain, Category, Status, Title, Excerpt, Slug, Published Date, Post ID, Content (HTML)
    let imported = 0;
    let skipped  = 0;
    let notFound = 0;
    const errors: string[] = [];
    const preview: { domain: string; title: string }[] = [];

    // Cache domain lookups to avoid N+1 queries
    const domainCache = new Map<string, string | null>(); // url → id

    for (const row of rows) {
      const domainUrl = cleanString(row["Domain"] ?? row["domain"] ?? "");
      const title     = cleanString(row["Title"] ?? row["title"] ?? "");
      const content   = cleanString(row["Content (HTML)"] ?? row["content"] ?? "");
      const excerpt   = cleanString(row["Excerpt"] ?? row["excerpt"] ?? "");
      const rawSlug   = cleanString(row["Slug"] ?? row["slug"] ?? "");
      const dateStr   = cleanString(row["Published Date"] ?? row["date"] ?? "");

      if (!domainUrl || !title || !content) { skipped++; continue; }

      if (action === "preview") {
        if (preview.length < 20) preview.push({ domain: domainUrl, title });
        continue;
      }

      // Find domain in DB
      if (!domainCache.has(domainUrl)) {
        const normalized = domainUrl.startsWith("http") ? domainUrl.replace(/\/$/, "") : `https://${domainUrl}`;
        const domain = await prisma.domain.findFirst({
          where: { url: { in: [normalized, normalized + "/", domainUrl] } },
          select: { id: true },
        });
        domainCache.set(domainUrl, domain?.id ?? null);
      }
      const domainId = domainCache.get(domainUrl)!;
      if (!domainId) { notFound++; continue; }

      const finalSlug = rawSlug || slugify(title) || `post-${Date.now()}`;
      const publishedAt = dateStr ? new Date(dateStr) : null;

      try {
        await prisma.article.upsert({
          where: { domainId_slug: { domainId, slug: finalSlug } },
          create: {
            domainId,
            title,
            slug: finalSlug,
            content,
            excerpt,
            featuredImage: "",
            status: "draft",
            aiSourceUrl: domainUrl,
            publishedAt: publishedAt ?? undefined,
          },
          update: {
            title,
            content,
            excerpt,
            publishedAt: publishedAt ?? undefined,
          },
        });
        imported++;
      } catch {
        skipped++;
        if (errors.length < 10) errors.push(`${domainUrl} — ${title.substring(0, 50)}`);
      }
    }

    if (action === "preview") {
      return NextResponse.json({
        totalRows: rows.length,
        preview,
      });
    }

    return NextResponse.json({ imported, skipped, notFound, errors });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
