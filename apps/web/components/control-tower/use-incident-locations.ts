"use client";

import { useEffect, useMemo, useState } from "react";
import { getIncidentDetail } from "@/lib/api/control-tower";
import type { IncidentReport } from "@/lib/contracts";
import { segmentLabel } from "@/lib/dimensions";

/**
 * Where each open investigation is, when it is anywhere at all.
 *
 * The list endpoint returns reports without candidates, so a country only exists
 * on the detail response. The Control Room used to fetch one detail — the
 * selected incident — which is why the globe could never show more than a single
 * point no matter how many investigations were open. That was a frontend ceiling,
 * not a data one, so this asks for the details it needs.
 *
 * Every open investigation is considered, not only the escalated ones. That rule
 * belongs to alerting — an inconclusive report should not wake anyone up — but
 * the map answers a different question: where is work open. An investigation in
 * Brazil that has not settled on a cause is still an investigation in Brazil,
 * and the queue on the same screen already lists it.
 *
 * Bounded on purpose: the top handful by reported impact, not every report.
 *
 * Crucially, this also counts what it *cannot* place. Candidates are generated
 * over five dimensions and only about a third of the possible shapes include a
 * country, so a winning candidate of `merchant = VuelaYa` has no geography at
 * all. That is a finding worth stating, not a gap worth hiding.
 */

export type IncidentLocation = {
  incidentId: string;
  country: string;
  segment: string;
  status: IncidentReport["status"];
  revenueAtRiskPerHour: number;
};

export type IncidentLocations = {
  located: IncidentLocation[];
  /** Open escalated investigations whose leading explanation has no country. */
  unlocatedCount: number;
  consideredCount: number;
  loading: boolean;
};

export function useIncidentLocations(reports: IncidentReport[], limit = 6): IncidentLocations {
  const considered = useMemo(
    () =>
      [...reports]
        .sort(
          (left, right) =>
            right.estimated_revenue_loss_usd_per_hour - left.estimated_revenue_loss_usd_per_hour,
        )
        .slice(0, limit),
    [reports, limit],
  );

  // A stable key, so the effect refires when the set of incidents changes rather
  // than on every poll that returns the same reports in new object identities.
  const key = considered.map((report) => report.incident_id).join("|");

  const [resolved, setResolved] = useState<{ key: string; entries: IncidentLocation[] }>({
    key: "",
    entries: [],
  });

  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    const load = async () => {
      const details = await Promise.all(
        considered.map(async (report) => {
          try {
            const detail = await getIncidentDetail(report.incident_id);
            const winner =
              detail.candidates.find(
                (candidate) => candidate.candidate_id === detail.report.winning_candidate_id,
              ) ?? detail.candidates[0];
            const country = winner?.dimensions.country;
            if (!country) return null;
            return {
              incidentId: report.incident_id,
              country,
              segment: segmentLabel(winner.dimensions) ?? country,
              status: report.status,
              revenueAtRiskPerHour: report.estimated_revenue_loss_usd_per_hour,
            } satisfies IncidentLocation;
          } catch {
            // One unreachable detail must not blank the map; it simply is not placed.
            return null;
          }
        }),
      );

      if (cancelled) return;
      setResolved({
        key,
        entries: details.filter((entry): entry is IncidentLocation => entry !== null),
      });
    };

    void load();
    return () => {
      cancelled = true;
    };
    // `considered` is derived from `key`; depending on both would refire on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A result belonging to a previous set of incidents is simply not this answer.
  const located = resolved.key === key ? resolved.entries : [];

  return {
    located,
    unlocatedCount: Math.max(0, considered.length - located.length),
    consideredCount: considered.length,
    loading: resolved.key !== key,
  };
}
