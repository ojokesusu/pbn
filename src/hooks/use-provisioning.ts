"use client";

import { useEffect, useState } from "react";
import type {
  ProvisioningOverview,
  HealthServer,
  CapacityRollup,
  DeployQueueItem,
} from "@/types/provisioning";

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useOverview() {
  const [state, setState] = useState<FetchState<ProvisioningOverview>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/provisioning");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ProvisioningOverview;
        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      }
    };
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

type BatchDetail = ProvisioningOverview["activeBatches"][number] & {
  status: string;
};

export function useBatchDetail(batchId: string | null) {
  const [state, setState] = useState<FetchState<BatchDetail>>({
    data: null,
    loading: batchId !== null,
    error: null,
  });

  useEffect(() => {
    if (!batchId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/provisioning/batches/${batchId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as BatchDetail;
        if (cancelled) return;
        setState({ data: json, loading: false, error: null });

        // Poll faster while running, stop when not
        if (json?.status === "running" && !intervalId) {
          intervalId = setInterval(fetchData, 5_000);
        } else if (json?.status !== "running" && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      }
    };

    fetchData();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [batchId]);

  return state;
}

export function useHealth() {
  const [state, setState] = useState<FetchState<HealthServer[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/provisioning/health");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HealthServer[];
        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      }
    };
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

export function useCapacity() {
  const [state, setState] = useState<FetchState<CapacityRollup>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/provisioning/capacity");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CapacityRollup;
        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      }
    };
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

export type WorkerHeartbeatRow = {
  workerId: string;
  lastBeatAt: string;
  runningTaskIds: string[];
  status: string;
  hostname: string;
  pid: number;
  startedAt: string;
  isAlive: boolean;
  staleSeconds: number;
};

export function useWorkers() {
  const [state, setState] = useState<FetchState<WorkerHeartbeatRow[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/provisioning/workers");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { workers: WorkerHeartbeatRow[] };
        if (!cancelled)
          setState({ data: json.workers ?? [], loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      }
    };
    fetchData();
    const id = setInterval(fetchData, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

export function useDeployQueue() {
  const [state, setState] = useState<FetchState<DeployQueueItem[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/provisioning/deploy-queue");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DeployQueueItem[];
        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
      }
    };
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
