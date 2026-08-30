"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ChevronRight, Globe2 } from "lucide-react";
import RotatingEarth, { type GlobeHotspot } from "@/components/ui/wireframe-dotted-globe";
import { ReportStatusBadge } from "@/components/ui/status";
import type { IncidentReport, Transaction } from "@/lib/contracts";
import { dimensionValueLabel } from "@/lib/dimensions";
import { integer, percent, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIncidentLocations } from "./use-incident-locations";

/**
 * Affected corridors.
 *
 * Renamed from "impact geography" because a country is not what PHAROS claims.
 * The claim is a corridor — NovaPay × Brazil × Card × Itaú — and a globe cannot
 * draw one. So the globe anchors, and the ledger beside it carries the actual
 * finding; if the canvas never painted, no information would be lost.
 *
 * Selecting a corridor also reports what the live stream is doing in that
 * country right now. That is measured from the transactions this browser has
 * actually received, and it is labelled as such — it is a window on a session,
 * not a national statistic.
 */

const countryCoordinates: Record<string, Pick<GlobeHotspot, "latitude" | "longitude" | "country" | "countryCode">> = {
  AR: { country: "Argentina", countryCode: "AR", latitude: -38.4161, longitude: -63.6167 },
  BR: { country: "Brazil", countryCode: "BR", latitude: -14.235, longitude: -51.9253 },
  CO: { country: "Colombia", countryCode: "CO", latitude: 4.5709, longitude: -74.2973 },
  MX: { country: "Mexico", countryCode: "MX", latitude: 23.6345, longitude: -102.5528 },
};

/** Below this, an approval rate for one country is noise. Same rule as the status bar. */
const MIN_COUNTRY_SAMPLE = 25;

export function AffectedCorridors({
  reports,
  transactions,
}: {
  reports: IncidentReport[];
  transactions: Transaction[];
}) {
  const { located, unlocatedCount, consideredCount, loading } = useIncidentLocations(reports);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mappable = useMemo(
    () => located.filter((entry) => countryCoordinates[entry.country]),
    [located],
  );

  const selected = mappable.find((entry) => entry.incidentId === selectedId) ?? mappable[0];

  const hotspots: GlobeHotspot[] = useMemo(
    () =>
      mappable.map((entry) => ({
        ...countryCoordinates[entry.country],
        incidentId: entry.incidentId,
        label: `${countryCoordinates[entry.country].country} · ${entry.segment}`,
        severity: entry.status === "confirmed" ? "high" : "medium",
      })),
    [mappable],
  );

  const selectHotspot = useCallback((hotspot: GlobeHotspot) => setSelectedId(hotspot.incidentId), []);

  /** Live traffic for the selected country, from this session's own stream. */
  const traffic = useMemo(() => {
    if (!selected) return null;
    const inCountry = transactions.filter((transaction) => transaction.country === selected.country);
    if (!inCountry.length) return { count: 0, approvalRate: null, providers: [] as string[] };
    const approved = inCountry.filter((transaction) => transaction.approved).length;
    return {
      count: inCountry.length,
      approvalRate: inCountry.length >= MIN_COUNTRY_SAMPLE ? approved / inCountry.length : null,
      providers: [...new Set(inCountry.map((transaction) => transaction.provider))],
    };
  }, [selected, transactions]);

  // Nothing open at all: the section has nothing to be about.
  if (!consideredCount && !loading) return null;

  return (
    <section className="corridors-card control-card mt-3">
      <div className="corridors-head">
        <div>
          <p className="eyebrow">Affected corridors</p>
          <h2>Where the open investigations are</h2>
        </div>
        <span className="corridors-count">
          <Globe2 className="size-3.5" aria-hidden="true" />
          {mappable.length} of {consideredCount} mapped
        </span>
      </div>

      {mappable.length ? (
        <div className="corridors-body">
          <div className="corridors-globe">
            <RotatingEarth
              height={300}
              className="corridors-canvas"
              hotspots={hotspots}
              selectedCountryCode={selected ? countryCoordinates[selected.country].countryCode : undefined}
              onHotspotSelect={selectHotspot}
            />
          </div>

          <ol className="corridors-ledger">
            {mappable.map((entry) => {
              const active = entry.incidentId === selected?.incidentId;
              return (
                <li key={entry.incidentId}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(entry.incidentId)}
                    className={cn("corridor-row", active && "corridor-row-active")}
                  >
                    <span className="corridor-row-top">
                      <strong>{countryCoordinates[entry.country].country}</strong>
                      <em>{usd(entry.revenueAtRiskPerHour)}/hr</em>
                    </span>
                    <span className="corridor-segment">{entry.segment}</span>
                    <ReportStatusBadge status={entry.status} />
                  </button>

                  {active ? (
                    <div className="corridor-detail">
                      {/* Measured here, from this browser's stream — not a claim about
                          the country's payments at large. */}
                      <p className="eyebrow">Live stream · {countryCoordinates[entry.country].country}</p>
                      <dl>
                        <div>
                          <dt>Observed</dt>
                          <dd>{traffic?.count ? `${integer(traffic.count)} tx` : "—"}</dd>
                        </div>
                        <div>
                          <dt>Approval</dt>
                          <dd>
                            {traffic?.approvalRate !== null && traffic?.approvalRate !== undefined
                              ? percent(traffic.approvalRate)
                              : "Sample too small"}
                          </dd>
                        </div>
                        <div>
                          <dt>Providers seen</dt>
                          <dd>
                            {traffic?.providers.length
                              ? traffic.providers
                                  .map((provider) => dimensionValueLabel("provider", provider))
                                  .join(", ")
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                      <p className="corridor-caveat">
                        Counted from the {integer(transactions.length)} transactions this browser has
                        received, not from the full corridor.
                      </p>
                      <Link href={`/incidents/${entry.incidentId}`} className="corridor-open">
                        Open investigation <ChevronRight className="size-3" aria-hidden="true" />
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        /* The common case, and a finding rather than a gap: an incident whose
           leading explanation is a merchant or a provider has no geography. */
        <div className="corridors-empty">
          <p>
            <strong>No geographic pattern.</strong>{" "}
            {consideredCount === 1
              ? "The open investigation is not explained by a country."
              : `None of the ${consideredCount} open investigations is explained by a country.`}{" "}
            Their leading explanations sit on other dimensions — a merchant regression, a
            provider-wide drop — which is itself a useful thing to know.
          </p>
        </div>
      )}

      {mappable.length && unlocatedCount ? (
        <p className="corridors-foot">
          {unlocatedCount} further {unlocatedCount === 1 ? "investigation is" : "investigations are"}{" "}
          not explained by a country and {unlocatedCount === 1 ? "is" : "are"} not placed here.
        </p>
      ) : null}
    </section>
  );
}
