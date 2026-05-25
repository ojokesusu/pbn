"use client";

import { useEffect, useState } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Stats = {
  totals: { acquisition: number; deployable: number; deployed: number; queue: number; articles: number };
  progress: { pct: number; remainingDays: number; etaDate: string; pacePerDay: number };
  pool: { genreBreakdown: { genre: string; count: number }[]; serverDistribution: { server: string; count: number }[] };
  daily: { date: string; count: number }[];
  recent: { deployedAt: string; name: string; genre: string; server: string; filesChanged: number }[];
};

const PIE_COLORS = ["#14b8a6", "#84cc16", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

export default function MigrationPage() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/migration").then((r) => r.json()).then(setData).catch(console.error);
    };
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <SidebarInset>
        <AppHeader title="Migrasi PBN" />
        <div className="flex-1 p-6 md:p-8">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </SidebarInset>
    );
  }

  const t = data.totals;
  const p = data.progress;

  return (
    <SidebarInset>
      <AppHeader title="Migrasi PBN" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Sudah LIVE</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-600">{t.deployed}</div>
              <div className="text-xs text-muted-foreground mt-1">dari {t.deployable} deployable</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Antrian Deploy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-amber-600">{t.queue}</div>
              <div className="text-xs text-muted-foreground mt-1">pace {p.pacePerDay}/hari</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Estimasi Selesai</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-teal-600">{p.remainingDays} hari</div>
              <div className="text-xs text-muted-foreground mt-1">target {p.etaDate}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Artikel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-pink-600">{t.articles.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.acquisition} domain acquisition</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Progress Migration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
                  style={{ width: `${p.pct}%` }}
                />
              </div>
              <div className="text-2xl font-bold tabular-nums w-20 text-right">{p.pct}%</div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-sm text-muted-foreground">
              <div>Deployed: <strong className="text-foreground">{t.deployed}</strong></div>
              <div>Queue: <strong className="text-foreground">{t.queue}</strong></div>
              <div>Total: <strong className="text-foreground">{t.deployable}</strong></div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Pool Breakdown by Genre</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data.pool.genreBreakdown} dataKey="count" nameKey="genre" cx="50%" cy="50%" outerRadius={90} label>
                    {data.pool.genreBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Distribusi Server</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={data.pool.serverDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="server" stroke="var(--muted-foreground)" />
                  <YAxis stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deploy 30 Hari Terakhir (anti-spam pace {p.pacePerDay}/hari)</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" tickFormatter={(v) => v.slice(5)} />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="count" fill="#84cc16" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Deploys (10 terakhir)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead className="text-right">Files</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs tabular-nums">{r.deployedAt.replace("T", " ").slice(0, 19)}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><Badge variant="secondary">{r.genre || "-"}</Badge></TableCell>
                    <TableCell><Badge>{r.server}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.filesChanged}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </SidebarInset>
  );
}
