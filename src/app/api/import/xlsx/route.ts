import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// Genre pool for auto-assignment
const GENRES = [
  "Teknologi", "Kesehatan", "Keuangan", "Pendidikan", "Olahraga",
  "Otomotif", "Properti", "Kuliner", "Travel", "Fashion",
  "Hiburan", "Bisnis", "Seni & Budaya", "Lingkungan", "Parenting",
  "Gaming", "Fotografi", "Musik", "Hukum", "Pertanian",
];

// Blog name templates per genre (Indonesian style)
const NAME_TEMPLATES: Record<string, string[]> = {
  "Teknologi": ["Dunia Digital", "Tech Insight", "Inovasi Tekno", "Ruang Teknologi", "Digital Corner", "Tekno Hari Ini", "Byte Nusantara", "Info Gadget", "Teknologi Kini", "Portal Tekno"],
  "Kesehatan": ["Sehat Alami", "Info Sehat", "Hidup Sehat", "Wellness ID", "Portal Kesehatan", "Gaya Sehat", "Tips Medis", "Sehat Setiap Hari", "Kesehatan Kita", "Dunia Medis"],
  "Keuangan": ["Finansial Cerdas", "Tips Keuangan", "Uang Bijak", "Smart Finance", "Keuangan Pintar", "Investasi Kita", "Portal Finansial", "Dunia Investasi", "Keuangan Harian", "Profit Corner"],
  "Pendidikan": ["Belajar Yuk", "Edu Nusantara", "Portal Pendidikan", "Ruang Belajar", "Ilmu Pedia", "Pintar Bersama", "Edukasi Kita", "Kampus Info", "Belajar Online", "Wawasan Baru"],
  "Olahraga": ["Sport Mania", "Dunia Olahraga", "Info Bola", "Arena Sport", "Sporty Life", "Goal Nusantara", "Lapangan Hijau", "Sport Update", "Kompetisi ID", "Atlet Kita"],
  "Otomotif": ["Otomotif Kini", "Motor Mania", "Dunia Roda", "Auto Review", "Speed Zone", "Mobil Idaman", "Garasi Digital", "Otomotif Harian", "Roda Dua Tiga", "Kendaraan Kita"],
  "Properti": ["Rumah Impian", "Properti Kita", "Griya Nusantara", "Info Properti", "Hunian Idaman", "Investasi Properti", "Rumah & Gaya", "Properti Harian", "Desain Rumah", "Arsitek Kita"],
  "Kuliner": ["Rasa Nusantara", "Kuliner Kita", "Resep Harian", "Foodie Corner", "Dapur Digital", "Sajian Lezat", "Cita Rasa", "Kuliner Harian", "Masakan Kita", "Warung Online"],
  "Travel": ["Jalan Jalan", "Wisata Kita", "Travel Nusantara", "Petualang ID", "Destinasi Impian", "Explore Indonesia", "Wisata Harian", "Peta Wisata", "Backpacker ID", "Dunia Travel"],
  "Fashion": ["Gaya Kekinian", "Fashion Corner", "Style ID", "Trend Fashion", "Mode Nusantara", "Outfit Harian", "Fashionista", "Look Book", "Busana Kita", "Style Harian"],
  "Hiburan": ["Hiburan Kita", "Dunia Hiburan", "Entertaintment ID", "Seru Banget", "Fun Corner", "Nonton Yuk", "Pop Culture", "Hiburan Harian", "Viral Hari Ini", "Layar Kaca"],
  "Bisnis": ["Bisnis Kita", "Entrepreneur ID", "Dunia Usaha", "Startup Corner", "Bisnis Harian", "Usaha Sukses", "Market Insight", "Peluang Bisnis", "Ekonomi Kita", "Dunia Dagang"],
  "Seni & Budaya": ["Seni Nusantara", "Budaya Kita", "Galeri Seni", "Warisan Budaya", "Kreatif Corner", "Seni Harian", "Tradisi Kita", "Sanggar Digital", "Seni Rupa ID", "Budaya Harian"],
  "Lingkungan": ["Hijau Kita", "Eco Corner", "Bumi Lestari", "Go Green ID", "Lingkungan Harian", "Alam Kita", "Dunia Hijau", "Eco Life", "Planet Sehat", "Peduli Alam"],
  "Parenting": ["Bunda Pintar", "Parenting ID", "Keluarga Kita", "Anak Cerdas", "Mama & Papa", "Tips Parenting", "Rumah Tangga", "Ibu & Anak", "Tumbuh Kembang", "Keluarga Harian"],
  "Gaming": ["Game Zone", "Gamer ID", "Dunia Game", "Play Station", "Mobile Gaming", "E-Sport Kita", "Game Review", "Pixel Corner", "Level Up ID", "Arena Gaming"],
  "Fotografi": ["Foto Kita", "Lensa Digital", "Capture Moment", "Fotografi ID", "Shutter Click", "Angle Perfect", "Visual Corner", "Foto Harian", "Kamera Kita", "Snap ID"],
  "Musik": ["Musik Kita", "Nada Merdu", "Beat Corner", "Melodi Harian", "Musik Nusantara", "Sound Wave", "Chord & Lirik", "Irama Kita", "Studio Digital", "Harmoni ID"],
  "Hukum": ["Hukum Kita", "Legal Corner", "Dunia Hukum", "Info Hukum", "Advokat Online", "Hukum Harian", "Keadilan ID", "Portal Hukum", "Legal Insight", "Undang Undang"],
  "Pertanian": ["Tani Kita", "Agro Corner", "Panen Raya", "Petani Digital", "Kebun Kita", "Agrikultur ID", "Sawah Hijau", "Dunia Tani", "Hortikultura", "Lumbung Padi"],
};

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val).trim();
  // Remove leading apostrophe (Excel formula escape)
  if (s.startsWith("'")) s = s.substring(1);
  // Remove trailing/leading newlines
  s = s.replace(/[\r\n]+/g, "").trim();
  return s;
}

function cleanHost(val: unknown): string {
  let s = cleanString(val);
  // Sometimes Excel converts IP to number (e.g. 5135244172 instead of 5.135.244.172)
  if (/^\d{9,12}$/.test(s)) {
    // Try to reconstruct IP from number — this is a known Excel issue
    // For IPs stored as numbers, we can't reliably reconstruct, so keep as-is
    // But we'll try the common pattern
  }
  // Remove leading/trailing spaces and dots
  s = s.replace(/^[\s.]+|[\s.]+$/g, "");
  return s;
}

function cleanUrl(val: unknown): string {
  let s = cleanString(val);
  // Ensure https:// prefix
  if (s && !s.startsWith("http://") && !s.startsWith("https://")) {
    s = "https://" + s;
  }
  // Remove trailing slash
  s = s.replace(/\/+$/, "");
  return s;
}

// Simple hash for deterministic assignment
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body; // "preview" or "import"

    // Read xlsx file — find any .xlsx in the imports folder
    const importsDir = path.join(process.cwd(), "imports");
    if (!fs.existsSync(importsDir)) {
      return NextResponse.json({ error: "Folder imports/ tidak ditemukan" }, { status: 404 });
    }

    const xlsxFiles = fs.readdirSync(importsDir).filter(f => f.toLowerCase().endsWith(".xlsx"));
    if (xlsxFiles.length === 0) {
      return NextResponse.json({ error: "Tidak ada file .xlsx di folder imports/" }, { status: 404 });
    }

    // Prefer "Merged" file if it exists, otherwise use the first .xlsx
    const mergedFile = xlsxFiles.find(f => f.toLowerCase().includes("merged"));
    const filePath = path.join(importsDir, mergedFile || xlsxFiles[0]);

    const fileBuffer = fs.readFileSync(filePath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });
    const results: {
      servers: { total: number; imported: number; errors: string[] };
      domains: { total: number; imported: number; errors: string[] };
      backlinks: { total: number; imported: number; errors: string[] };
    } = {
      servers: { total: 0, imported: 0, errors: [] },
      domains: { total: 0, imported: 0, errors: [] },
      backlinks: { total: 0, imported: 0, errors: [] },
    };

    // ========== 1. IMPORT SERVERS ==========
    const serversSheet = wb.Sheets["Servers"];
    if (serversSheet) {
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(serversSheet, { header: 1 });
      const headers = (allRows[0] || []).map(h => cleanString(h).toLowerCase());
      const rows = allRows.slice(1);

      // Detect format: new (6 cols with NS1, NS2) or old (5 cols)
      // New format: NAME SERVER 1 | NAME SERVER 2 | HOST | USERNAME | PASSWORD | PORT
      // Old format: NAME | HOST | USERNAME | PASSWORD | PORT
      const hasNs2 = headers.some(h => h.includes("server 2") || h.includes("nameserver 2") || h.includes("name server 2") || h === "nama server 2");

      const serverData: { name: string; nameserver2: string; host: string; username: string; password: string; port: number }[] = [];

      for (const row of rows) {
        const r = row as unknown[];
        let name: string, nameserver2: string, host: string, username: string, password: string, port: number;

        if (hasNs2) {
          // New format: ns1 | ns2 | host | user | pass | port
          name = cleanString(r[0]);
          nameserver2 = cleanString(r[1]);
          host = cleanHost(r[2]);
          username = cleanString(r[3]);
          password = cleanString(r[4]);
          port = r[5] ? Number(r[5]) : 21;
        } else {
          // Old format: name | host | user | pass | port
          name = cleanString(r[0]);
          nameserver2 = "";
          host = cleanHost(r[1]);
          username = cleanString(r[2]);
          password = cleanString(r[3]);
          port = r[4] ? Number(r[4]) : 21;
        }

        if (!name || !host) continue;

        serverData.push({ name, nameserver2, host, username, password, port });
      }

      results.servers.total = serverData.length;

      if (action === "import" && serverData.length > 0) {
        await prisma.server.createMany({
          data: serverData.map(s => ({
            name: s.name,
            nameserver2: s.nameserver2,
            host: s.host,
            username: s.username,
            password: s.password,
            port: s.port,
            status: "active",
          })),
        });
        results.servers.imported = serverData.length;
      }
    }

    // Build domain → IP lookup from original PBN Domain and server data.xlsx if present
    // This helps match domains that share IPs (where ns1.domain.com doesn't exist as a server)
    const domainToIp = new Map<string, string>();
    const sourceFile = xlsxFiles.find(f => f.toLowerCase().includes("domain and server data"));
    if (sourceFile) {
      try {
        const sourceBuf = fs.readFileSync(path.join(importsDir, sourceFile));
        const sourceWb = XLSX.read(sourceBuf, { type: "buffer" });
        const sourceSheet = sourceWb.Sheets[sourceWb.SheetNames[0]];
        const sourceRows = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, { header: 1 }).slice(1);
        for (const row of sourceRows) {
          const r = row as unknown[];
          const domain = cleanString(r[0]).toLowerCase();
          const ip = cleanString(r[4]);
          if (domain && ip) domainToIp.set(domain, ip);
        }
      } catch {
        // ignore source file errors
      }
    }

    // ========== 2. IMPORT DOMAINS ==========
    const domainsSheet = wb.Sheets["Domains"];
    if (domainsSheet) {
      const allDomainRows = XLSX.utils.sheet_to_json<unknown[]>(domainsSheet, { header: 1 });
      const domainHeaders = (allDomainRows[0] || []).map(h => cleanString(h).toLowerCase());
      const rows = allDomainRows.slice(1);

      // Detect format
      // New: No. | name | url | genre | server_name_1 | server_name_2
      // Old: name | url | genre | server_name
      const hasNoColumn = domainHeaders[0] === "no." || domainHeaders[0] === "no";
      const colOffset = hasNoColumn ? 1 : 0;

      // Get all servers from DB to match by name + IP
      const allServers = action === "import" ? await prisma.server.findMany() : [];
      const serverMap = new Map(allServers.map(s => [s.name.toLowerCase().trim(), s.id]));
      // Also map by nameserver2 for fallback matching
      allServers.forEach(s => {
        if (s.nameserver2) {
          serverMap.set(s.nameserver2.toLowerCase().trim(), s.id);
        }
      });
      // Map IP → server ID for fallback when domains share an IP
      const serverByIp = new Map<string, string>();
      allServers.forEach(s => {
        if (s.host) serverByIp.set(s.host.trim(), s.id);
      });

      // Track used names to avoid duplicates
      const usedNames = new Set<string>();
      // Track genre index per genre for name selection
      const genreNameIndex: Record<string, number> = {};

      const domainData: { name: string; url: string; genre: string; serverId: string | null }[] = [];

      for (const row of rows) {
        const r = row as unknown[];
        let name = cleanString(r[colOffset + 0]);
        let url = cleanUrl(r[colOffset + 1]);
        let genre = cleanString(r[colOffset + 2]);
        const serverName = cleanString(r[colOffset + 3]);

        if (!url) continue;

        // Auto-generate genre if empty or "AI Generate"
        if (!genre || genre.toLowerCase() === "ai generate") {
          const hash = simpleHash(url);
          genre = GENRES[hash % GENRES.length];
        }

        // Auto-generate name if empty or "AI Generate"
        if (!name || name.toLowerCase() === "ai generate") {
          const templates = NAME_TEMPLATES[genre] || NAME_TEMPLATES["Teknologi"];
          const idx = genreNameIndex[genre] || 0;

          // Get domain name from URL for uniqueness
          const domainPart = url.replace(/https?:\/\//, "").replace(/\..+$/, "");

          // Pick a base name from templates
          let baseName = templates[idx % templates.length];
          genreNameIndex[genre] = idx + 1;

          // If name already used, append domain hint
          if (usedNames.has(baseName)) {
            baseName = `${baseName} ${domainPart.charAt(0).toUpperCase()}${domainPart.slice(1, 4)}`;
          }

          // Still duplicate? Add number
          let finalName = baseName;
          let counter = 2;
          while (usedNames.has(finalName)) {
            finalName = `${baseName} ${counter}`;
            counter++;
          }

          name = finalName;
        }

        usedNames.add(name);

        // Match server — try by nameserver name first, then by IP fallback
        let serverId: string | null = null;
        if (serverName) {
          serverId = serverMap.get(serverName.toLowerCase().trim()) || null;
          if (!serverId) {
            serverId = serverMap.get(serverName.toLowerCase().replace(/\s+$/, "")) || null;
          }
        }
        // Fallback: match by IP for shared-IP domains
        if (!serverId) {
          const domainPart = url.replace(/https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
          const ip = domainToIp.get(domainPart);
          if (ip) {
            serverId = serverByIp.get(ip) || null;
          }
        }

        domainData.push({ name, url, genre, serverId });
      }

      results.domains.total = domainData.length;

      if (action === "import" && domainData.length > 0) {
        for (const d of domainData) {
          try {
            await prisma.domain.create({
              data: {
                name: d.name,
                url: d.url,
                genre: d.genre,
                serverId: d.serverId,
                status: "active",
              },
            });
            results.domains.imported++;
          } catch (err) {
            results.domains.errors.push(`Domain ${d.url}: ${String(err)}`);
          }
        }
      }

      // For preview, return the generated data
      if (action === "preview") {
        return NextResponse.json({
          servers: results.servers,
          domains: {
            ...results.domains,
            preview: domainData.slice(0, 20),
          },
          backlinks: results.backlinks,
        });
      }
    }

    // ========== 3. IMPORT BACKLINKS ==========
    const backlinksSheet = wb.Sheets["Backlinks"];
    if (backlinksSheet) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(backlinksSheet, { header: 1 }).slice(1);
      const backlinkData: { anchorText: string; targetUrl: string; type: string }[] = [];

      for (const row of rows) {
        const r = row as unknown[];
        // Columns: No, anchor_text, target_url, Type Link
        const anchorText = cleanString(r[1]);
        let targetUrl = cleanUrl(r[2]);
        const type = cleanString(r[3]);

        if (!targetUrl) continue;

        backlinkData.push({
          anchorText: anchorText.toLowerCase() === "ai generate" ? "" : anchorText,
          targetUrl,
          type,
        });
      }

      results.backlinks.total = backlinkData.length;

      if (action === "import" && backlinkData.length > 0) {
        await prisma.backlink.createMany({
          data: backlinkData.map(b => ({
            anchorText: b.anchorText,
            targetUrl: b.targetUrl,
            type: b.type,
            status: "active",
          })),
        });
        results.backlinks.imported = backlinkData.length;
      }
    }

    return NextResponse.json({
      message: `Import selesai! Server: ${results.servers.imported}, Domain: ${results.domains.imported}, Backlink: ${results.backlinks.imported}`,
      results,
    });
  } catch (error) {
    console.error("Failed to import xlsx:", error);
    return NextResponse.json(
      { error: `Import gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}
