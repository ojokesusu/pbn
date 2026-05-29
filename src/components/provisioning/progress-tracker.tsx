"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ProvisioningOverview } from "@/types/provisioning";

type Batch = ProvisioningOverview["activeBatches"][number];

type Props = {
  batches: Batch[];
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "running") {
    return <Badge style={{ background: "#06b6d4", color: "white" }}>running</Badge>;
  }
  if (s === "completed") {
    return <Badge style={{ background: "#10b981", color: "white" }}>completed</Badge>;
  }
  if (s === "failed") {
    return <Badge style={{ background: "#ef4444", color: "white" }}>failed</Badge>;
  }
  return <Badge variant="secondary">{s || "pending"}</Badge>;
}

function etaMinutes(batch: Batch): number | null {
  if (batch.status.toLowerCase() !== "running") return null;
  if (batch.runningCount <= 0) return null;
  const remaining = batch.pendingCount + batch.runningCount;
  if (remaining <= 0) return null;
  // assume 6 min per running task, parallelism = runningCount
  const minutes = Math.ceil((remaining / Math.max(batch.runningCount, 1)) * 6);
  return minutes;
}

export default function ProgressTracker({ batches }: Props) {
  if (!batches || batches.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-8">
        Belum ada batch aktif.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {batches.map((batch) => {
        const eta = etaMinutes(batch);
        return (
          <Card key={batch.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{batch.name}</CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{batch.provider}</Badge>
                  {statusBadge(batch.status)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={batch.progressPct} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>
                  {batch.progressPct}% &mdash; {batch.completedCount}/{batch.totalTargets} done
                </span>
                {eta !== null && (
                  <span className="text-cyan-600 font-medium">ETA ~{eta} menit</span>
                )}
              </div>
              <div className="grid grid-cols-4 mt-3 gap-2 text-center text-sm">
                <div>
                  <div className="font-bold text-emerald-600 tabular-nums">
                    {batch.completedCount}
                  </div>
                  <div className="text-xs text-muted-foreground">completed</div>
                </div>
                <div>
                  <div className="font-bold text-cyan-600 tabular-nums">
                    {batch.runningCount}
                  </div>
                  <div className="text-xs text-muted-foreground">running</div>
                </div>
                <div>
                  <div className="font-bold text-muted-foreground tabular-nums">
                    {batch.pendingCount}
                  </div>
                  <div className="text-xs text-muted-foreground">pending</div>
                </div>
                <div>
                  <div className="font-bold text-red-600 tabular-nums">
                    {batch.failedCount}
                  </div>
                  <div className="text-xs text-muted-foreground">failed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
