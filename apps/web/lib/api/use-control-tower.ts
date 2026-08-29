"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connectTransactionStream,
  getIncidentDetail,
  getIncidentReports,
  type IncidentDetail,
} from "@/lib/api/control-tower";
import type { IncidentReport, Transaction } from "@/lib/contracts";

type RuntimeStatus = "loading" | "live" | "unavailable";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Control Tower API unavailable";
}

export function useIncidentReports(refreshMs = 10_000) {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [status, setStatus] = useState<RuntimeStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextReports = await getIncidentReports();
      setReports(nextReports);
      setStatus("live");
      setError(null);
    } catch (nextError) {
      setStatus("unavailable");
      setError(errorMessage(nextError));
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), refreshMs);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(interval);
    };
  }, [refresh, refreshMs]);

  return { reports, status, error, refresh };
}

export function useIncidentDetail(incidentId: string | null) {
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [status, setStatus] = useState<RuntimeStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!incidentId) {
      setDetail(null);
      setStatus("live");
      setError(null);
      return;
    }
    try {
      const nextDetail = await getIncidentDetail(incidentId);
      setDetail(nextDetail);
      setStatus("live");
      setError(null);
    } catch (nextError) {
      setStatus("unavailable");
      setError(errorMessage(nextError));
    }
  }, [incidentId]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { detail, status, error, refresh };
}

export function useTransactionStream(limit = 80) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<RuntimeStatus>("loading");

  useEffect(() => {
    const close = connectTransactionStream(
      (transaction) => {
        setTransactions((current) => [transaction, ...current.filter((item) => item.transaction_id !== transaction.transaction_id)].slice(0, limit));
        setStatus("live");
      },
      () => setStatus("unavailable"),
    );
    return close;
  }, [limit]);

  return { transactions, status };
}
