import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activateDomains, deactivateDomains } from "@/lib/scheduler";

// POST — activate or deactivate domains in the scheduler
// body: { action: "activate" | "deactivate", domainIds?: string[], filter?: "deployed" | "withContent" | "empty" | "all" }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, domainIds, filter } = body;

    let ids: string[] = domainIds || [];

    // If no specific IDs, use filter to select domains
    if (ids.length === 0 && filter) {
      let where = {};
      switch (filter) {
        case "deployed":
          where = { lastDeployed: { not: null }, server: { isNot: null } };
          break;
        case "withContent":
          where = { articles: { some: {} }, server: { isNot: null } };
          break;
        case "empty":
          where = { articles: { none: {} }, server: { isNot: null } };
          break;
        case "all":
          where = { server: { isNot: null } };
          break;
      }
      const domains = await prisma.domain.findMany({
        where,
        select: { id: true },
      });
      ids = domains.map(d => d.id);
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: "Tidak ada domain untuk diproses" }, { status: 400 });
    }

    if (action === "activate") {
      const count = await activateDomains(ids);
      return NextResponse.json({
        message: `${count} domain diaktifkan di scheduler`,
        activated: count,
      });
    } else if (action === "deactivate") {
      await deactivateDomains(ids);
      return NextResponse.json({
        message: `${ids.length} domain dinonaktifkan dari scheduler`,
        deactivated: ids.length,
      });
    } else {
      return NextResponse.json({ error: "Action harus 'activate' atau 'deactivate'" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
