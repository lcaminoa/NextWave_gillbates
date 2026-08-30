import type { ChaosSpec, Dimensions } from "@/lib/contracts";

export const chaosManualFixture: ChaosSpec = {
  chaos_id: "chaos-manual-template",
  mode: "manual",
  dimensions: {
    merchant: "Marea",
    provider: "NovaPay",
    payment_method: "card",
    country: "BR",
    issuing_bank: "Itaú",
    canonical_decline_code: "do_not_honor",
  },
  severity_pp: -25,
  started_at: "2026-08-29T15:45:00.000Z",
  duration_minutes: 20,
  revealed: false,
};

export const chaosRandomFixture: ChaosSpec = {
  chaos_id: "chaos-random-template",
  mode: "random_unknown",
  severity_pp: -25,
  started_at: "2026-08-29T15:45:00.000Z",
  duration_minutes: 20,
  revealed: false,
};

export const chaosSystemFindingFixture: Dimensions = {
  provider: "NovaPay",
  country: "BR",
  payment_method: "card",
  issuing_bank: "Itaú",
  canonical_decline_code: "do_not_honor",
};
