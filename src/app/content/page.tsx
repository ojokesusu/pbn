"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Rss,
  Sparkles,
  DollarSign,
  ListChecks,
  Settings as SettingsIcon,
  Tag,
} from "lucide-react";

import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ContentStats = {
  totalJobs: number;
  todayJobs: number;
  queueDepth: number;
  spendUsdToday: number;
  spendUsdMonth: number;
  budgetCapUsd: number;
  successRate: number;
  failed: number;
  pending: number;
  running: number;
};

export default function ContentOverviewPage() {
  const [stats, setStats] = useState<ContentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/content/stats");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ContentStats;
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const budgetPct =
    stats && stats.budgetCapUsd > 0
      ? Math.min(100, (stats.spendUsdMonth / stats.budgetCapUsd) * 100)
      : 0;
  const budgetColor =
    budgetPct > 85
      ? "text-red-600"
      : budgetPct > 70
        ? "text-amber-600"
        : "text-teal-600";
  const budgetBar =
    budgetPct > 85
      ? "bg-red-500"
      : budgetPct > 70
        ? "bg-amber-500"
        : "bg-teal-500";

  return (
    <SidebarInset>
      <AppHeader title="Content Pipeline" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Content Pipeline</h2>
            <p className="text-xs text-muted-foreground">
              Pipeline RSS → AI rewrite → publish. Monitor jobs, budget, prompts.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {loading && !stats ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Total Jobs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-cyan-600 tabular-nums">
                    {stats?.totalJobs ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats?.successRate ?? 0}% success
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Hari Ini
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-emerald-600 tabular-nums">
                    {stats?.todayJobs ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    artikel diproses
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Spend Hari Ini
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-amber-600 tabular-nums">
                    ${(stats?.spendUsdToday ?? 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ${(stats?.spendUsdMonth ?? 0).toFixed(2)} bulan ini
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Queue Depth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-purple-600 tabular-nums">
                    {stats?.queueDepth ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats?.running ?? 0} running, {stats?.pending ?? 0} pending
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Budget progress */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Bulan Ini</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <div className={`text-2xl font-bold tabular-nums ${budgetColor}`}>
                    ${(stats?.spendUsdMonth ?? 0).toFixed(2)} / $
                    {(stats?.budgetCapUsd ?? 0).toFixed(2)}
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${budgetColor}`}>
                    {budgetPct.toFixed(0)}%
                  </div>
                </div>
                <div className="h-2 w-full rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded ${budgetBar}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {budgetPct > 85
                    ? "Hampir limit — pertimbangkan naikkan cap atau slow down."
                    : budgetPct > 70
                      ? "Mendekati batas — monitor pemakaian."
                      : "Aman."}
                </div>
              </CardContent>
            </Card>

            {/* Quick links */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link href="/content/niches">
                <Card className="hover:ring-cyan-400 hover:ring-2 transition cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Tag className="size-4 text-cyan-600" /> Niche Mapping
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Mapping domain ke niche untuk routing RSS &amp; prompt.
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/content/rss-sources">
                <Card className="hover:ring-amber-400 hover:ring-2 transition cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Rss className="size-4 text-amber-600" /> RSS Sources
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Kelola feed RSS per niche. Toggle, tambah, hapus.
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/content/prompts">
                <Card className="hover:ring-purple-400 hover:ring-2 transition cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="size-4 text-purple-600" /> Prompt
                      Templates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Edit system &amp; user prompt per niche.
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/content/jobs">
                <Card className="hover:ring-emerald-400 hover:ring-2 transition cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ListChecks className="size-4 text-emerald-600" /> Jobs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Queue history dengan filter status.
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/content/budget">
                <Card className="hover:ring-pink-400 hover:ring-2 transition cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DollarSign className="size-4 text-pink-600" /> Budget
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Edit cap, spend bar, breakdown per model.
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/content/settings">
                <Card className="hover:ring-teal-400 hover:ring-2 transition cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <SettingsIcon className="size-4 text-teal-600" /> Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Pace, model, similarity threshold, dll.
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </>
        )}
      </div>
    </SidebarInset>
  );
}
