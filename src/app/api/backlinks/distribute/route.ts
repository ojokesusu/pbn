import { NextResponse } from "next/server";
import { distributeBacklinks } from "@/lib/backlink-distributor";
import { denyIfNotAdmin } from "@/lib/auth";

export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await distributeBacklinks();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to distribute backlinks:", error);
    return NextResponse.json(
      { error: "Gagal mendistribusikan backlink" },
      { status: 500 }
    );
  }
}
