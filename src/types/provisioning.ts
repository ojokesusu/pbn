export type ProvisioningOverview = {
  stats: {
    totalServers: number, activeServers: number,
    totalDomains: number, assignedDomains: number,
    healthyServers: number, staleServers: number,
  },
  capacity: {
    totalSlot: number, usedSlot: number, availableSlot: number,
    byTier: { tier: string, servers: number, slot: number }[],
    byProvider: { provider: string, servers: number, slot: number, used: number }[],
  },
  activeBatches: Array<{
    id: string, name: string, provider: string, status: string,
    totalTargets: number, completedCount: number, failedCount: number,
    runningCount: number, pendingCount: number, progressPct: number,
    createdAt: string,
  }>,
  recentTasks: Array<{
    id: string, label: string, host: string, status: string,
    progress: number, currentStep: string,
    startedAt: string | null, completedAt: string | null, updatedAt: string,
  }>,
}

export type HealthServer = {
  serverId: string, label: string, host: string,
  provider: string, region: string, tier: string, stack: string,
  domainCap: number,
  olsRunning: boolean, phpVersion: string, ftpStatus: string,
  ramUsedMb: number, ramTotalMb: number, ramUsedPct: number,
  diskUsedGb: number, diskTotalGb: number, diskUsedPct: number,
  domainCount: number, capacityUsedPct: number,
  loadAvg1: number, errorMessage: string,
  checkedAt: string, isStale: boolean,
}

export type CapacityRollup = {
  total: { servers: number, slot: number, used: number, available: number, pct: number },
  byTier: { tier: string, servers: number, slot: number, used: number, pct: number }[],
  byProvider: { provider: string, servers: number, slot: number, used: number, pct: number }[],
  byRegion: { region: string, servers: number, slot: number, used: number, pct: number }[],
  servers: Array<{ id: string, label: string, provider: string, region: string, tier: string, stack: string, domainCount: number, domainCap: number, usedPct: number, headroom: number }>,
}

export type DeployQueueItem = {
  id: string, domainId: string, domainName: string,
  serverId: string | null, serverLabel: string | null,
  priority: number, status: string,
  scheduledAt: string | null, attemptedAt: string | null,
  completedAt: string | null, errorMessage: string | null,
  createdAt: string,
}
