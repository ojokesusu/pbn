// ── Cloudflare API client ──
// Docs: https://developers.cloudflare.com/api/

const CF_API = "https://api.cloudflare.com/client/v4";

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN tidak ada di .env");
  return token;
}

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
  result_info?: { total_count: number; total_pages: number; page: number };
}

export interface CfZone {
  id: string;
  name: string;
  status: string; // active, pending, etc.
  name_servers?: string[]; // CF-assigned nameservers (e.g. arvind.ns.cloudflare.com)
  original_name_servers?: string[];
}

export interface CfDnsRecord {
  id: string;
  type: string; // A, CNAME, etc.
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

async function cfFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = (await res.json()) as CfResponse<T>;
  if (!data.success) {
    const msg = data.errors?.map(e => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

// Verify token is valid
export async function verifyToken(): Promise<{ id: string; status: string }> {
  return cfFetch<{ id: string; status: string }>("/user/tokens/verify");
}

// List all zones (paginated)
export async function listAllZones(): Promise<CfZone[]> {
  const all: CfZone[] = [];
  let page = 1;
  const perPage = 50;

  while (page <= 200) {
    const res = await fetch(`${CF_API}/zones?per_page=${perPage}&page=${page}`, {
      headers: {
        "Authorization": `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
    });
    const data = (await res.json()) as CfResponse<CfZone[]>;
    if (!data.success) break;

    all.push(...data.result);

    const totalPages = data.result_info?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return all;
}

// Find a zone by domain name (e.g. example.com)
export async function findZoneByName(domain: string): Promise<CfZone | null> {
  const result = await cfFetch<CfZone[]>(`/zones?name=${encodeURIComponent(domain)}`);
  return result[0] || null;
}

// List DNS records for a zone
export async function listDnsRecords(zoneId: string): Promise<CfDnsRecord[]> {
  return cfFetch<CfDnsRecord[]>(`/zones/${zoneId}/dns_records?per_page=100`);
}

// Create a DNS record
export async function createDnsRecord(zoneId: string, record: {
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
}): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      proxied: record.proxied ?? false,
      ttl: record.ttl ?? 1, // 1 = auto
    }),
  });
}

// Update an existing DNS record
export async function updateDnsRecord(zoneId: string, recordId: string, record: {
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
}): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      proxied: record.proxied ?? false,
      ttl: record.ttl ?? 1,
    }),
  });
}

// Sync DNS for one domain → set A @ → IP, CNAME www → @
// Returns what was changed.
// `proxied` param: when set (true/false), forces both records to that proxy state.
// When omitted, preserves existing proxy state on update and defaults to false on create.
export async function syncDomainDns(domain: string, ip: string, proxied?: boolean): Promise<{
  domain: string;
  zoneId: string;
  aRecord: { action: "created" | "updated" | "unchanged"; from?: string };
  wwwRecord: { action: "created" | "updated" | "unchanged"; from?: string };
}> {
  // Find the zone
  const zone = await findZoneByName(domain);
  if (!zone) throw new Error(`Zone "${domain}" tidak ditemukan di Cloudflare`);
  if (zone.status !== "active") throw new Error(`Zone "${domain}" status: ${zone.status} (belum active)`);

  // Get existing records
  const records = await listDnsRecords(zone.id);

  // Find A record for @ (root)
  const aRecord = records.find(r => r.type === "A" && (r.name === domain || r.name === "@"));
  const wwwRecord = records.find(r => (r.type === "A" || r.type === "CNAME") && (r.name === `www.${domain}` || r.name === "www"));

  const result: {
    domain: string;
    zoneId: string;
    aRecord: { action: "created" | "updated" | "unchanged"; from?: string };
    wwwRecord: { action: "created" | "updated" | "unchanged"; from?: string };
  } = {
    domain,
    zoneId: zone.id,
    aRecord: { action: "unchanged" },
    wwwRecord: { action: "unchanged" },
  };

  // Handle A record
  if (!aRecord) {
    await createDnsRecord(zone.id, {
      type: "A",
      name: domain,
      content: ip,
      proxied: proxied ?? false,
      ttl: 1,
    });
    result.aRecord = { action: "created" };
  } else {
    const desiredProxied = proxied ?? aRecord.proxied;
    const ipChanged = aRecord.content !== ip;
    const proxyChanged = aRecord.proxied !== desiredProxied;
    if (ipChanged || proxyChanged) {
      await updateDnsRecord(zone.id, aRecord.id, {
        type: "A",
        name: domain,
        content: ip,
        proxied: desiredProxied,
        ttl: aRecord.ttl,
      });
      result.aRecord = { action: "updated", from: aRecord.content };
    }
  }

  // Handle www CNAME
  if (!wwwRecord) {
    await createDnsRecord(zone.id, {
      type: "CNAME",
      name: `www.${domain}`,
      content: domain,
      proxied: proxied ?? false,
      ttl: 1,
    });
    result.wwwRecord = { action: "created" };
  } else if (wwwRecord.type === "A" && wwwRecord.content !== ip) {
    // www was an A record pointing somewhere else — update it
    await updateDnsRecord(zone.id, wwwRecord.id, {
      type: "A",
      name: `www.${domain}`,
      content: ip,
      proxied: proxied ?? wwwRecord.proxied,
      ttl: wwwRecord.ttl,
    });
    result.wwwRecord = { action: "updated", from: wwwRecord.content };
  } else if (wwwRecord.type === "CNAME" && wwwRecord.content !== domain) {
    await updateDnsRecord(zone.id, wwwRecord.id, {
      type: "CNAME",
      name: `www.${domain}`,
      content: domain,
      proxied: proxied ?? wwwRecord.proxied,
      ttl: wwwRecord.ttl,
    });
    result.wwwRecord = { action: "updated", from: wwwRecord.content };
  } else if (proxied !== undefined && wwwRecord.proxied !== proxied) {
    // Proxy state mismatch — flip it without touching content
    await updateDnsRecord(zone.id, wwwRecord.id, {
      type: wwwRecord.type,
      name: wwwRecord.name,
      content: wwwRecord.content,
      proxied,
      ttl: wwwRecord.ttl,
    });
    result.wwwRecord = { action: "updated", from: `proxied=${wwwRecord.proxied}` };
  }

  return result;
}

// Extract bare domain from URL (https://example.com → example.com)
export function bareDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();
}
