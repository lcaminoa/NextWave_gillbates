# Contratos compartidos

Segunda reconciliación del día. La primera fusionó mis contratos originales con 3 schemas
sueltos (`01_transaction_schema.md`, `02_alert_schema.md`, `03_diagnosis_schema.md`, ya
borrados). Esta reemplaza *todo eso* porque apareció `NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md`
— un plan mucho más investigado (competidores reales: Primer, IXOPAY, Juspay, Spreedly, Gr4vy,
Datadog Bits AI, Rootly; producto real de Yuno) que define un modelo de datos más rico. **Ese
documento manda ahora** — estos contratos son su traducción a código ejecutable. Fuente: sus
secciones 12 (modelo de datos), 19 (streams), 20 (contratos y endpoints) y 9 (diferenciadores
técnicos, para entender por qué cada campo existe).

## El pipeline (8 entidades)

```
Transaction              Stream A (simulador) — un pago
      |
      v
BaselinePoint             Stream B — qué es "normal" para un segmento (Beta-Binomial)
      +
Anomaly                   Stream B — señal de que algo se desvió, sostenido, del baseline
      |
      v
IncidentCandidate          Stream B — hipótesis de QUÉ segmento explica la Anomaly (puede haber varias)
      +
Evidence                   Stream B — los datos concretos que citan las hipótesis
      |
      v
InvestigationStep          Stream C — cada paso del agente investigando (se muestra en vivo)
      |
      v
IncidentReport              Stream C — resultado final: causa raíz, costo, acción, nunca ejecutada

ChaosSpec                  Stream D -> Stream A: qué anomalía inyectar (oculta si es random_unknown)
```

**Por qué son 8 entidades y no 4 como en mi primer intento**: separar `Anomaly` (la señal cruda)
de `IncidentCandidate` (una hipótesis sobre la causa) permite que existan *varias* hipótesis
compitiendo antes de elegir una — necesario para el punto MUST "camino de evidencia
insuficiente" (si dos candidatos quedan empatados, `IncidentReport.status` es `"inconclusive"`,
no se fuerza una respuesta). Y separar `InvestigationStep` de `IncidentReport` es lo que permite
mostrar al agente investigando en vivo (escena 4 de la demo en el master plan), no solo el
resultado final.

## Decisiones de diseño ya tomadas (ver también `DECISIONS.md`)

- **`canonical_decline_code` + `raw_provider_code`/`raw_provider_message`**: se guarda el código
  crudo del proveedor *y* la versión normalizada. Perderíamos evidencia real si solo
  guardáramos la versión canónica.
- **`status: "confirmed" | "probable" | "inconclusive"`** en vez de un booleano de "evidencia
  suficiente": son 3 estados a propósito (master plan §9.9), no 2 — "probable" es distinto de
  "no sabemos".
- **Cada `claim` de `IncidentReport` lleva `evidence_ids`**: ninguna afirmación del LLM puede
  quedar sin referencia a evidencia concreta — es la defensa contra "el LLM alucinó la causa".
- **`mix_shift_effect_pp` / `performance_effect_pp` son opcionales** (SHOULD, no MUST): la
  descomposición de mezcla de tráfico es un diferenciador fuerte pero no bloqueante — el
  detector puede funcionar sin ella al principio y sumarla después.

## Endpoints congelados (master plan §20)

```
GET  /api/health
GET  /api/stream               # SSE/WebSocket de Transaction en vivo
GET  /api/incidents             # lista de IncidentReport
GET  /api/incidents/:id         # detalle: candidates + evidence + investigation_steps

POST /api/chaos/inject          # ChaosSpec modo manual
POST /api/chaos/random          # ChaosSpec modo random_unknown — oculta las dimensiones
POST /api/chaos/reveal          # revela las dimensiones del último ChaosSpec
```

Nadie inventa una ruta nueva sin agregarla acá primero.

## Lista de `canonical_decline_code` (master plan §13)

`insufficient_funds`, `do_not_honor`, `issuer_unavailable`, `suspected_fraud`,
`authentication_required`, `provider_timeout`, `invalid_data`. Si el simulador necesita otro,
se agrega acá antes de usarlo.

## Reglas

- Nadie inventa un campo nuevo en el dashboard o en el engine sin agregarlo acá primero.
- `Severity`, `ReportStatus`, `ChaosMode` y los nombres de rutas son literales — copiá y pegá,
  no parafrasees, entre `types.ts` y `schemas.py`.
- `confidence`, tasas de aprobación/rechazo y `credible_interval` son siempre 0-1. Plata en USD
  sin convertir. Tiempos siempre ISO 8601.
- `IncidentReport.recommended_action` se sugiere, nunca se ejecuta — ningún endpoint dispara la
  acción automáticamente.
