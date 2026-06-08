"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CapacityRollup } from "@/types/provisioning";

const PIE_COLORS = [
  "#14b8a6",
  "#84cc16",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
];

type Props = {
  capacity: CapacityRollup | null;
};

export default function CapacityChart({ capacity }: Props) {
  if (!capacity) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-muted-foreground text-sm">Loading capacity...</p>
        </CardContent>
      </Card>
    );
  }

  const total = capacity.total ?? {
    servers: 0,
    slot: 0,
    used: 0,
    available: 0,
    pct: 0,
  };

  const utilPct = Math.round(total.pct ?? 0);
  const utilColor = utilPct > 70 ? "text-amber-600" : "text-teal-600";

  const tierData = (capacity.byTier ?? []).map((t) => ({
    tier: t.tier,
    used: t.used,
    available: Math.max(0, t.slot - t.used),
  }));

  const providerData = (capacity.byProvider ?? [])
    .filter((p) => p.provider !== "seekahost-legacy" && p.used > 0)
    .map((p) => ({
      provider: p.provider,
      domains: p.used,
    }));

  return (
    <div className="space-y-6">
      {/* Section 1 — Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Slot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {total.slot.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {total.servers} server
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 tabular-nums">
              {total.used.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              terpakai
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-cyan-600 tabular-nums">
              {total.available.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              tersisa
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold tabular-nums ${utilColor}`}>
              {utilPct}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {utilPct > 70 ? "perlu kapasitas" : "sehat"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2 — Tier BarChart */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Kapasitas per Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tierData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="tier"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="used"
                  stackId="cap"
                  fill="#14b8a6"
                  name="Used"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="available"
                  stackId="cap"
                  fill="#94a3b8"
                  name="Available"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — Provider PieChart */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Distribusi per Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={providerData}
                  dataKey="domains"
                  nameKey="provider"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry: { name?: string; value?: number }) =>
                    `${entry.name ?? ""} (${entry.value ?? 0})`
                  }
                >
                  {providerData.map((_, i) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {(() => {
            const legacy = capacity.byProvider?.find(
              (p) => p.provider === "seekahost-legacy"
            );
            if (!legacy || legacy.used === 0) return null;
            return (
              <p className="text-xs text-muted-foreground mt-3">
                {legacy.used} domain masih nyangkut di {legacy.servers} server seekahost-legacy (sisa migrasi dari SeekaHost, lagi dibersihin).
              </p>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
