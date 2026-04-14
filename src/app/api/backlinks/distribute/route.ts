import { NextResponse } from "next/server";
import { distributeBacklinks } from "@/lib/backlink-distributor";

export async function POST() {
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
