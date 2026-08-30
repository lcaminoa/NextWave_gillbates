# Arquitectura — Control Tower

El "por qué" completo está en `NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md` (y su versión en
inglés, útil para armar el pitch). Este archivo es el mapa corto: qué entidad vive en qué
carpeta y quién la produce, para no tener que releer 2000 líneas en medio del código.

El diagrama editable y exportable está en [`ARCHITECTURE.mmd`](ARCHITECTURE.mmd). Es la fuente
para generar `ARCHITECTURE.png` y `ARCHITECTURE.pdf` que pide la checklist de pre-flight.

## El loop

```
Transaction (Stream A, simulador + Chaos Injector)
      |
      v
BaselinePoint + Anomaly (Stream B — motor de detección)
      |
      v
IncidentCandidate + Evidence (Stream B — motor de RCA/diagnóstico)
      |
      v
InvestigationStep + IncidentReport (Stream C — agente investigador OpenAI)
      |
      v
Evidence Audit gate (API/orquestación — aprueba o retiene el draft)
      |
      v
Dashboard (Stream D) — reporte + sello de auditoría + consola de caos
```

`ChaosSpec` corre al revés: Stream D (o el jurado) lo dispara, Stream A lo consume para inyectar
la anomalía, y solo se revela mediante `POST /api/chaos/reveal`. El runtime asocia un blind trial
con un episodio antes del reveal usando únicamente tiempo y fingerprints nuevos. Después del
reveal, un evaluador determinista compara esa asociación ya cerrada contra la verdad y agrega el
score al envelope API-local de la respuesta.

`EvidenceAuditView`, `BlindTrialRun`, `BlindTrialEvaluation`, `IncidentDetail` y
`ChaosRevealResponse` son modelos API-locales en `engine/api/`; no modifican las ocho entidades
compartidas. La verdad revelada nunca vuelve al detector, Investigator o Evidence Auditor.

## Streams -> carpetas -> contratos

| Stream | Carpeta | Produce | Detalle en el master plan |
|---|---|---|---|
| A — Simulación + datos | `simulator/` | `Transaction`, atiende `ChaosSpec` | §13, §14 |
| B — Detección + RCA/ML | `engine/detection`, `engine/rootcause` | `BaselinePoint`, `Anomaly`, `IncidentCandidate`, `Evidence` | §9.1–9.7 |
| C — Investigador OpenAI | `engine/investigator` | `InvestigationStep`, `IncidentReport` | §9.8–9.11, §10, §11 |
| D — Producto/UI/demo | `apps/web` | dashboard, consola de caos (`/chaos`), deploy | §17, §18 |

Los tipos exactos de cada entidad están en `contracts/types.ts` + `contracts/schemas.py` — no
se duplican acá. Los endpoints congelados están en `contracts/CONTRACTS.md`.

## Prioridad si el tiempo aprieta (master plan §23, resumido)

MUST: flujo en vivo realista, detección consciente de estacionalidad, inyección de incidente
desconocido, RCA multidimensional, evidencia citada, impacto en ingresos, explicación con
OpenAI, prueba end-to-end en vivo, múltiples incidentes simultáneos, camino de "evidencia
insuficiente". Todo lo demás (descomposición de mezcla, controles entre proveedores, memoria
histórica, timeline visual) es SHOULD o STRETCH — sumarlo solo si el núcleo ya funciona sólido.

Si hay que cortar en el último tramo, lo que **no** se toca (master plan §31):

```
INCIDENTE DESCONOCIDO -> DETECTADO -> INVESTIGACIÓN AUTÓNOMA -> EVIDENCIA -> CAUSA RAÍZ CORRECTA
```
