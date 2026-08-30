import type { Dimensions } from "@/lib/contracts";

/**
 * Human labels for the raw contract values. The Chaos Lab already carried this
 * dictionary privately, which is why an incident headline used to read
 * "BR × card × nova_pay × itau" while the injector right next to it said
 * "Brazil / Card / Nova Pay". One dictionary, every surface.
 *
 * Unknown values fall through to a readable form of the raw value rather than a
 * placeholder: the runtime is free to emit segments this list has never seen and
 * the UI must show them truthfully, not hide them.
 */

export type DimensionField = keyof Dimensions;

type DimensionSpec = {
  label: string;
  /** Order in a segment headline: country → method → provider → issuer reads as a path. */
  options: Array<{ value: string; label: string }>;
};

const dimensionSpecs: Record<DimensionField, DimensionSpec> = {
  merchant: {
    label: "Merchant",
    options: [
      { value: "VuelaYa", label: "VuelaYa" },
      { value: "Comercio1", label: "Comercio 1" },
      { value: "Comercio2", label: "Comercio 2" },
      { value: "Comercio3", label: "Comercio 3" },
      { value: "TiendaNorte", label: "Tienda Norte" },
    ],
  },
  provider: {
    label: "Provider",
    options: [
      { value: "nova_pay", label: "NovaPay" },
      { value: "atlas_pay", label: "AtlasPay" },
      { value: "stripe", label: "Stripe" },
      { value: "adyen", label: "Adyen" },
    ],
  },
  payment_method: {
    label: "Payment method",
    options: [
      { value: "card", label: "Card" },
      { value: "pix", label: "Pix" },
      { value: "wallet", label: "Wallet" },
      { value: "pse", label: "PSE" },
    ],
  },
  country: {
    label: "Country",
    options: [
      { value: "BR", label: "Brazil" },
      { value: "MX", label: "Mexico" },
      { value: "CO", label: "Colombia" },
      { value: "AR", label: "Argentina" },
    ],
  },
  issuing_bank: {
    label: "Issuing bank",
    options: [
      { value: "itau", label: "Itaú" },
      { value: "nubank", label: "Nubank" },
      { value: "bradesco", label: "Bradesco" },
      { value: "bbva_mx", label: "BBVA México" },
      { value: "banorte", label: "Banorte" },
      { value: "santander_mx", label: "Santander México" },
      { value: "bancolombia", label: "Bancolombia" },
      { value: "davivienda", label: "Davivienda" },
      { value: "galicia", label: "Galicia" },
      { value: "santander_ar", label: "Santander Argentina" },
      { value: "bbva_ar", label: "BBVA Argentina" },
    ],
  },
  canonical_decline_code: {
    label: "Decline code",
    options: [
      { value: "insufficient_funds", label: "Insufficient funds" },
      { value: "do_not_honor", label: "Do not honor" },
      { value: "issuer_unavailable", label: "Issuer unavailable" },
      { value: "suspected_fraud", label: "Suspected fraud" },
      { value: "authentication_required", label: "Authentication required" },
      { value: "provider_timeout", label: "Provider timeout" },
      { value: "invalid_data", label: "Invalid data" },
    ],
  },
};

/** The order dimensions read in as a cause path: broadest scope first. */
export const dimensionOrder: DimensionField[] = [
  "merchant",
  "country",
  "payment_method",
  "provider",
  "issuing_bank",
  "canonical_decline_code",
];

export const dimensionFields = dimensionOrder.map((key) => ({
  key,
  label: dimensionSpecs[key].label,
}));

export function dimensionOptions(field: DimensionField) {
  return dimensionSpecs[field].options;
}

export function dimensionLabel(field: DimensionField) {
  return dimensionSpecs[field].label;
}

/** Readable fallback for a value the dictionary does not know: "nova_pay" -> "Nova pay". */
function humanise(value: string) {
  const spaced = value.replaceAll("_", " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function dimensionValueLabel(field: DimensionField, value?: string) {
  if (!value) return undefined;
  const match = dimensionSpecs[field].options.find((option) => option.value === value);
  return match?.label ?? humanise(value);
}

/** The dimensions a segment actually carries, in cause-path order, already humanised. */
export function describeDimensions(dimensions?: Dimensions) {
  if (!dimensions) return [];
  return dimensionOrder.flatMap((key) => {
    const label = dimensionValueLabel(key, dimensions[key]);
    return label ? [{ key, field: dimensionSpecs[key].label, value: label }] : [];
  });
}

/** "NovaPay × Brazil × Card × Itaú" — the segment headline used across every screen. */
export function segmentLabel(dimensions?: Dimensions) {
  const parts = describeDimensions(dimensions).map((entry) => entry.value);
  return parts.length ? parts.join(" × ") : null;
}

/** Turns a runtime action string such as "query_segment(provider=nova_pay)" into prose. */
export function actionLabel(action: string) {
  const [name] = action.split("(");
  return humanise(name);
}
