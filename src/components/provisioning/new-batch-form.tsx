"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProviderOption =
  | "idch"
  | "biznet"
  | "rumahweb"
  | "contabo"
  | "dewaweb"
  | "niagahoster"
  | "other";

type TierOption = "1gb" | "2gb" | "4gb" | "8gb";

type ParsedTarget = {
  label: string;
  ip: string;
  sshUser: string;
  sshPassword: string;
};

const PROVIDER_OPTIONS: { value: ProviderOption; label: string }[] = [
  { value: "idch", label: "IDCloudHost" },
  { value: "biznet", label: "Biznet Gio" },
  { value: "rumahweb", label: "Rumahweb" },
  { value: "contabo", label: "Contabo" },
  { value: "dewaweb", label: "Dewaweb" },
  { value: "niagahoster", label: "Niagahoster" },
  { value: "other", label: "Lainnya" },
];

const TIER_OPTIONS: { value: TierOption; label: string }[] = [
  { value: "1gb", label: "1 GB RAM" },
  { value: "2gb", label: "2 GB RAM" },
  { value: "4gb", label: "4 GB RAM" },
  { value: "8gb", label: "8 GB RAM" },
];

const CSV_PLACEHOLDER = `label,ip,sshUser,sshPassword
vps-01,1.2.3.4,root,password123
vps-02,5.6.7.8,root,password456`;

function parseCreds(csv: string): ParsedTarget[] {
  if (!csv || !csv.trim()) return [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith("label,"));

  const targets: ParsedTarget[] = [];
  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cols.length !== 4) continue;
    const [label, ip, sshUser, sshPassword] = cols;
    if (!label || !ip || !sshUser || !sshPassword) continue;
    targets.push({ label, ip, sshUser, sshPassword });
  }
  return targets;
}

export default function NewBatchForm({
  onSubmitSuccess,
}: {
  onSubmitSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderOption>("contabo");
  const [region, setRegion] = useState("");
  const [tier, setTier] = useState<TierOption>("2gb");
  const [credsRaw, setCredsRaw] = useState("");

  const parsedTargets = useMemo(() => parseCreds(credsRaw), [credsRaw]);

  function resetForm() {
    setName("");
    setProvider("contabo");
    setRegion("");
    setTier("2gb");
    setCredsRaw("");
    setError(null);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Batch name wajib diisi.");
      return;
    }
    if (parsedTargets.length === 0) {
      setError("Belum ada VPS valid. Cek format CSV: label,ip,sshUser,sshPassword.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/provisioning/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          provider,
          region: region.trim(),
          tier,
          targets: parsedTargets,
        }),
      });

      if (!res.ok) {
        let msg = `Gagal membuat batch (HTTP ${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = String(body.error);
          else if (body?.message) msg = String(body.message);
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      setOpen(false);
      resetForm();
      onSubmitSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setSubmitting(false);
    }
  }

  const detectedCount = parsedTargets.length;
  const detectedColor = detectedCount > 0 ? "text-emerald-600" : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-teal-600 hover:bg-teal-700 text-white">
            + Tambah Batch Baru
          </Button>
        }
      />

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch Provisioning Baru</DialogTitle>
          <DialogDescription>
            Tempel kredensial VPS dalam format CSV. Sistem akan otomatis menjalankan
            setup batch pada target yang terdeteksi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="batch-name">
              Nama Batch <span className="text-red-600">*</span>
            </label>
            <Input
              id="batch-name"
              placeholder="contoh: contabo-batch-jakarta-mei"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as ProviderOption)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="batch-region">
                Region
              </label>
              <Input
                id="batch-region"
                placeholder="jakarta, java, eu"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tier</label>
              <Select value={tier} onValueChange={(v) => setTier(v as TierOption)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih tier" />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="batch-creds">
              Kredensial VPS (CSV)
            </label>
            <Textarea
              id="batch-creds"
              className="h-32 font-mono text-xs"
              placeholder={CSV_PLACEHOLDER}
              value={credsRaw}
              onChange={(e) => setCredsRaw(e.target.value)}
            />
            <p className={`text-xs font-medium ${detectedColor}`}>
              {detectedCount} VPS terdetect
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={submitting || detectedCount === 0 || !name.trim()}
            >
              {submitting ? "Membuat..." : `Buat Batch (${detectedCount} VPS)`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
