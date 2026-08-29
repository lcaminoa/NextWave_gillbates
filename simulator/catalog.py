"""Catálogos y probabilidades del mundo sintético compartido por Stream A."""

MERCHANTS = ["VuelaYa", "Comercio1", "Comercio2", "Comercio3", "TiendaNorte"]
PROVIDERS = ["nova_pay", "atlas_pay", "stripe", "adyen"]
COUNTRIES = ["BR", "MX", "CO", "AR"]

PAYMENT_METHODS_BY_COUNTRY = {
    "BR": ["card", "pix"],
    "MX": ["card", "wallet"],
    "CO": ["card", "pse"],
    "AR": ["card", "wallet"],
}
ISSUING_BANKS_BY_COUNTRY = {
    "BR": ["itau", "nubank", "bradesco"],
    "MX": ["bbva_mx", "banorte", "santander_mx"],
    "CO": ["bancolombia", "davivienda"],
    "AR": ["galicia", "santander_ar", "bbva_ar"],
}

BASE_APPROVAL_RATE = {"pix": 0.98, "card": 0.88, "pse": 0.93, "wallet": 0.96}

DECLINE_CODES = [
    "insufficient_funds",
    "do_not_honor",
    "issuer_unavailable",
    "suspected_fraud",
    "authentication_required",
    "provider_timeout",
    "invalid_data",
]
RAW_CODE_BY_DECLINE = {
    "insufficient_funds": "51",
    "do_not_honor": "05",
    "issuer_unavailable": "91",
    "suspected_fraud": "59",
    "authentication_required": "65",
    "provider_timeout": "68",
    "invalid_data": "12",
}
