"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeployQueueItem } from "@/types/provisioning";

type Props = { queue: DeployQueueItem[] };

type DayBucket = { date: string; count: number };

function groupByDay(queue: DeployQueueItem[]): DayBucket[] {
  const map = new Map<string, number>();
  for (const item of queue) {
    if (!item.scheduledAt) continue;
    const date = item.scheduledAt.slice(0, 10);
    map.set(date, (map.get(date) ?? 0) + 1);
  }
  const buckets = Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  buckets.sort((a, b) => a.date.localeCompare(b.date));
  return buckets.slice(0, 7);
}

function barColor(count: number): string {
  if (count <= 12) return "bg-emerald-500";
  if (count <= 15) return "bg-amber-500";
  return "bg-red-500";
}

export default function DeployQueueWidget({ queue }: Props) {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const scheduledCount = safeQueue.filter((q) => q.scheduledAt).length;
  const buckets = groupByDay(safeQueue);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Antrian Deploy</CardTitle>
          <span className="text-xs text-muted-foreground">
            {scheduledCount} domain queued
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {safeQueue.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Antrian deploy kosong.
          </div>
        ) : buckets.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Belum ada jadwal deploy.
          </div>
        ) : (
          <div className="space-y-3">
            {buckets.map((bucket) => {
              const pct = Math.min(100, (bucket.count / 15) * 100);
              return (
                <div key={bucket.date} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-foreground">{bucket.date}</span>
                    <span className="font-mono text-muted-foreground">
                      {bucket.count} deploy
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(bucket.count)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Anti-spam pace 10-15 deploy/hari per cluster
        </p>
      </CardContent>
    </Card>
  );
}
