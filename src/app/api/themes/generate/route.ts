import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateUniqueTheme, generateUniqueThemeForGenre } from "@/lib/theme-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const seed = body.seed || Date.now();
    const genre: string | undefined = body.genre;

    const generated = genre
      ? generateUniqueThemeForGenre(genre, seed)
      : generateUniqueTheme(seed);

    const themeName = genre
      ? `Auto Theme - ${generated.layoutName} - ${genre} (${generated.cssPrefix})`
      : `Auto Theme - ${generated.layoutName} (${generated.cssPrefix})`;

    const theme = await prisma.theme.create({
      data: {
        name: themeName,
        templateName: generated.layoutName, // keep existing field for compatibility
        layoutName: generated.layoutName,
        cssPrefix: generated.cssPrefix,
        primaryColor: generated.primaryColor,
        secondaryColor: generated.secondaryColor,
        accentColor: generated.accentColor,
        bgColor: generated.bgColor,
        textColor: generated.textColor,
        fontFamily: generated.fontFamily,
        headingFont: generated.headingFont,
        borderRadius: generated.borderRadius,
        shadowStyle: generated.shadowStyle,
        spacingScale: generated.spacingScale,
        containerWidth: generated.containerWidth,
        headerStyle: generated.headerStyle,
        footerStyle: generated.footerStyle,
        generatedCss: generated.generatedCss,
        isGenerated: true,
      },
      include: { _count: { select: { domains: true } } },
    });

    return NextResponse.json(theme, { status: 201 });
  } catch (error) {
    console.error("Failed to generate theme:", error);
    return NextResponse.json(
      { error: "Failed to generate theme" },
      { status: 500 }
    );
  }
}
