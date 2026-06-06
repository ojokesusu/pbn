import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deployDomain } from "@/lib/deploy";

// POST /api/deploy - Deploy a single domain's site
export async function POST(request: Request) {
  try {
    const { domainId } = await request.json();

    if (!domainId) {
      return NextResponse.json({ error: "domainId is required" }, { status: 400 });
    }

    const result = await deployDomain(domainId);

    if (result.status === "success") {
      return NextResponse.json({
        success: true,
        filesDeployed: result.filesDeployed,
        message: result.message,
      });
    } else {
      return NextResponse.json(
        { error: result.error || result.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Deploy error:", error);
    return NextResponse.json({ error: "Deploy failed" }, { status: 500 });
  }
}

// GET /api/deploy - Get deploy logs
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get("domainId");

    const where = domainId ? { domainId } : {};
    const logs = await prisma.deployLog.findMany({
      where,
      include: { domain: { select: { id: true, name: true, url: true } } },
      orderBy: { deployedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error fetching deploy logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
