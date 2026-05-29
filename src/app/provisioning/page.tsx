"use client";

import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useOverview,
  useHealth,
  useCapacity,
  useDeployQueue,
} from "@/hooks/use-provisioning";
import NewBatchForm from "@/components/provisioning/new-batch-form";
import ProgressTracker from "@/components/provisioning/progress-tracker";
import HealthDashboard from "@/components/provisioning/health-dashboard";
import CapacityChart from "@/components/provisioning/capacity-chart";
import VPSInventoryTable from "@/components/provisioning/vps-inventory-table";
import DeployQueueWidget from "@/components/provisioning/deploy-queue-widget";

export default function ProvisioningPage() {
  const overview = useOverview();
  const health = useHealth();
  const capacity = useCapacity();
  const queue = useDeployQueue();

  if (overview.loading && !overview.data) {
    return (
      <SidebarInset>
        <AppHeader title="Provisioning VPS" />
        <div className="flex-1 flex items-center justify-center p-6 md:p-8">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </SidebarInset>
    );
  }

  const stats = overview.data?.stats;
  const activeBatches = overview.data?.activeBatches ?? [];
  const healthServers = health.data ?? [];
  const totalServers = stats?.totalServers ?? 0;
  const healthyServers = stats?.healthyServers ?? 0;
  const capacityPct = Math.round(capacity.data?.total?.pct ?? 0);
  const capacityColor = capacityPct > 70 ? "text-amber-600" : "text-teal-600";
  const activeBatchCount = activeBatches.length;

  const errorMsg = overview.error ?? health.error ?? null;

  return (
    <SidebarInset>
      <AppHeader title="Provisioning VPS" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">

        {errorMsg && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Servers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-teal-600 tabular-nums">{totalServers}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats?.activeServers ?? 0} active
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Healthy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-600 tabular-nums">{healthyServers}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats?.staleServers ?? 0} stale
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Capacity Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-4xl font-bold tabular-nums ${capacityColor}`}>{capacityPct}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {capacityPct > 70 ? "perlu kapasitas" : "sehat"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-cyan-600 tabular-nums">{activeBatchCount}</div>
              <div className="text-xs text-muted-foreground mt-1">
                batch berjalan
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Buat Batch Provisioning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tempel kredensial VPS untuk menjalankan setup batch otomatis.
              </p>
              <NewBatchForm onSubmitSuccess={() => window.location.reload()} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Active Batches</CardTitle>
            </CardHeader>
            <CardContent>
              {activeBatchCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada batch aktif.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  {activeBatches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.provider} &middot; {b.totalTargets} VPS
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-bold text-cyan-600 tabular-nums">{b.progressPct}%</div>
                        <div className="text-[10px] text-muted-foreground">
                          {b.completedCount}/{b.totalTargets}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {activeBatchCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Progress Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressTracker batches={activeBatches} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Health Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <HealthDashboard servers={healthServers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kapasitas Cluster</CardTitle>
          </CardHeader>
          <CardContent>
            <CapacityChart capacity={capacity.data} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>VPS Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <VPSInventoryTable servers={healthServers} />
            </CardContent>
          </Card>
          <DeployQueueWidget queue={queue.data ?? []} />
        </div>

      </div>
    </SidebarInset>
  );
}
