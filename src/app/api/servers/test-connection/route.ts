import { NextResponse } from "next/server";
import { testFtpConnection } from "@/lib/ftp";
import { denyIfNotAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { host, username, password, port } = await request.json();

    if (!host || !username || !password) {
      return NextResponse.json(
        { error: "Host, username, dan password wajib diisi" },
        { status: 400 }
      );
    }

    const result = await testFtpConnection({
      host,
      user: username,
      password,
      port: port || 21,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Test connection error:", error);
    return NextResponse.json(
      { error: "Gagal menguji koneksi" },
      { status: 500 }
    );
  }
}
