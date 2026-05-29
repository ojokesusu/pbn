"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HealthServer } from "@/types/provisioning";

type Props = { servers: HealthServer[] };

function relativeTime(iso: string): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function barColor(pct: number): string {
  if (pct > 85) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function Bar({ label, pct, used, total, unit }: { label: string; pct: number; used: number; total: number; unit: string }) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {used.toFixed(0)}/{total.toFixed(0)} {unit} ({safePct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor(safePct)} transition-all`}
          style={{ width: `${safePct}%` }}
        />
      </div>
    </div>
  );
}

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}

export default function HealthDashboard({ servers }: Props) {
  const list = Array.isArray(servers) ? servers : [];
  const router = useRouter();

  const [stressTarget, setStressTarget] = useState<HealthServer | null>(null);
  const [dummyCount, setDummyCount] = useState<number>(15);
  const [durationSec, setDurationSec] = useState<number>(1800);
  const [concurrentWorkers, setConcurrentWorkers] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openStressDialog(s: HealthServer) {
    setStressTarget(s);
    setDummyCount(15);
    setDurationSec(1800);
    setConcurrentWorkers(5);
    setError(null);
  }

  function closeStressDialog() {
    if (submitting) return;
    setStressTarget(null);
    setError(null);
  }

  async function submitStressTest() {
    if (!stressTarget) return;
    setError(null);

    if (!Number.isFinite(dummyCount) || dummyCount < 1 || dummyCount > 30) {
      setError("dummyCount harus 1-30");
      return;
    }
    if (!Number.isFinite(durationSec) || durationSec < 60 || durationSec > 3600) {
      setError("durationSec harus 60-3600 detik (max 1 jam)");
      return;
    }
    if (
      !Number.isFinite(concurrentWorkers) ||
      concurrentWorkers < 1 ||
      concurrentWorkers > 20
    ) {
      setError("concurrentWorkers harus 1-20");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/provisioning/stress-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: stressTarget.serverId,
          dummyCount,
          durationSec,
          concurrentWorkers,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const id = json?.stressTest?.id;
      if (!id) {
        throw new Error("Response tidak mengandung stressTest.id");
      }
      setStressTarget(null);
      router.push(`/provisioning/stress-tests/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Belum ada data health check.
        </CardContent>
      </Card>
    );
  }

  const healthy = list.filter(
    (s) => s.olsRunning && s.ramUsedPct < 80 && !s.isStale,
  ).length;
  const warning = list.filter(
    (s) => (s.ramUsedPct > 80 || s.isStale) && s.olsRunning,
  ).length;
  const down = list.filter((s) => !s.olsRunning).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Healthy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{healthy}</div>
            <div className="text-xs text-muted-foreground mt-1">OLS up, RAM &lt;80%, fresh</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Warning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{warning}</div>
            <div className="text-xs text-muted-foreground mt-1">RAM tinggi atau data stale</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Down</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{down}</div>
            <div className="text-xs text-muted-foreground mt-1">OLS tidak running</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {list.map((s) => {
          const ramTotalGb = (s.ramTotalMb || 0) / 1024;
          const ramUsedGb = (s.ramUsedMb || 0) / 1024;
          return (
            <Card key={s.serverId} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3 space-y-3">
                <div>
                  <div className="font-semibold text-sm truncate" title={s.label}>
                    {s.label}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate" title={s.host}>
                    {s.host}
                  </div>
                </div>

                <div className="space-y-2">
                  <Bar
                    label="RAM"
                    pct={s.ramUsedPct}
                    used={ramUsedGb}
                    total={ramTotalGb}
                    unit="GB"
                  />
                  <Bar
                    label="Disk"
                    pct={s.diskUsedPct}
                    used={s.diskUsedGb}
                    total={s.diskTotalGb}
                    unit="GB"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Pill label={`OLS ${s.olsRunning ? "up" : "down"}`} ok={s.olsRunning} />
                  <Pill
                    label={`FTP ${s.ftpStatus === "running" ? "up" : "down"}`}
                    ok={s.ftpStatus === "running"}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                  <span className="font-mono">Load {(s.loadAvg1 ?? 0).toFixed(2)}</span>
                  <span>{relativeTime(s.checkedAt)}</span>
                </div>

                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openStressDialog(s)}
                  className="w-full border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950"
                >
                  Run Stress Test
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={stressTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeStressDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Stress Test: {stressTarget?.label ?? ""}
            </DialogTitle>
            <DialogDescription>
              Spawn dummy domains, hit endpoints, ukur RAM/swap/OOM untuk capacity planning.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="dummyCount">
                Dummy Count <span className="text-muted-foreground text-xs">(1-30)</span>
              </Label>
              <Input
                id="dummyCount"
                type="number"
                min={1}
                max={30}
                value={dummyCount}
                onChange={(e) => setDummyCount(Number(e.target.value))}
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="durationSec">
                Duration (detik) <span className="text-muted-foreground text-xs">(60-3600 / max 1 jam)</span>
              </Label>
              <Input
                id="durationSec"
                type="number"
                min={60}
                max={3600}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="concurrentWorkers">
                Concurrent Workers <span className="text-muted-foreground text-xs">(1-20)</span>
              </Label>
              <Input
                id="concurrentWorkers"
                type="number"
                min={1}
                max={20}
                value={concurrentWorkers}
                onChange={(e) => setConcurrentWorkers(Number(e.target.value))}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeStressDialog}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              onClick={submitStressTest}
              disabled={submitting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {submitting ? "Memulai..." : "Jalankan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
