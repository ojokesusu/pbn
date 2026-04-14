import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const themes = await prisma.theme.findMany({
      include: {
        _count: {
          select: { domains: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(themes);
  } catch (error) {
    console.error("Failed to fetch themes:", error);
    return NextResponse.json(
      { error: "Failed to fetch themes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      templateName,
      primaryColor,
      secondaryColor,
      accentColor,
      bgColor,
      textColor,
      fontFamily,
      headerStyle,
      footerStyle,
      customCss,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const theme = await prisma.theme.create({
      data: {
        name,
        templateName: templateName ?? "developer",
        primaryColor: primaryColor ?? "#2563eb",
        secondaryColor: secondaryColor ?? "#1e40af",
        accentColor: accentColor ?? "#f59e0b",
        bgColor: bgColor ?? "#ffffff",
        textColor: textColor ?? "#111827",
        fontFamily: fontFamily ?? "Inter",
        headerStyle: headerStyle ?? "centered",
        footerStyle: footerStyle ?? "simple",
        customCss: customCss ?? "",
      },
      include: {
        _count: {
          select: { domains: true },
        },
      },
    });

    return NextResponse.json(theme, { status: 201 });
  } catch (error) {
    console.error("Failed to create theme:", error);
    return NextResponse.json(
      { error: "Failed to create theme" },
      { status: 500 }
    );
  }
}
