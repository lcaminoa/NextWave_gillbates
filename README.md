# Control Tower

NextWave Hackathon 2026 · Challenge 2 (Yuno) · Equipo Gill Bates

**No estamos construyendo un dashboard que muestra un incidente de pagos. Estamos construyendo
un investigador de pagos con IA que demuestra qué lo causó.**

## Qué es esto

Un sistema que mira un stream de pagos en vivo, aprende qué conversión es normal para cada
segmento, detecta caídas reales (no ruido ni cambios de mezcla de tráfico), investiga la causa
raíz cruzando dimensiones con evidencia citable, y explica el resultado en lenguaje humano —
sin ejecutar nunca la acción recomendada. Tiene que sobrevivir a que un juez inyecte en vivo un
incidente que el equipo nunca vio.

- **Investigación completa y el porqué de cada decisión de producto**:
  [`NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md`](NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md)
  (también hay versión en inglés, útil para el pitch).
- **Mapa de arquitectura** (streams -> carpetas -> entidades): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Contratos y endpoints congelados**: [`contracts/CONTRACTS.md`](contracts/CONTRACTS.md)
- **Decisiones y sus alternativas** (entregable oficial): [`DECISIONS.md`](DECISIONS.md)
- **Reglas para Codex / cómo dividimos el trabajo**: [`AGENTS.md`](AGENTS.md)

## Cómo correrlo

```bash
# servicio Python: simulador + detección + RCA + investigador
uv sync && uv run uvicorn engine.main:app --reload --port 8000
uv run python simulator/run.py

# dashboard + consola de caos (Next.js)
cd apps/web
Copy-Item .env.example .env.local # una vez; apunta al engine local por defecto
pnpm install && pnpm dev
```

La consola de caos vive en `/chaos` del dashboard — ahí el jurado dispara un incidente
desconocido en vivo para la prueba a ciegas.

El frontend consume `GET /api/incidents`, el detalle, y el SSE de transacciones directamente
del engine configurado en `NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN`. El engine permite el origen
local del dashboard mediante `CONTROL_TOWER_CORS_ORIGINS`; en un deploy se configura el origen
exacto, nunca `*`.

Los `POST /api/chaos/*` llegan al mismo path en Next.js, pero se reenvían server-side al engine.
La ruta agrega `CONTROL_TOWER_JUDGE_TOKEN` sin exponerlo y protege tanto `/chaos` como esos POST
con Basic Auth de operador (`PHAROS_CHAOS_OPERATOR_USERNAME` y
`PHAROS_CHAOS_OPERATOR_PASSWORD`). En Vercel se configuran además
`CONTROL_TOWER_API_ORIGIN` y `NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN`; el segundo es solo para
lecturas/SSE. Todos los secretos quedan sin prefijo `NEXT_PUBLIC_`.

## Equipo y streams

| Stream | Quién | Qué toca |
|---|---|---|
| A — Simulación + datos | — | `simulator/` |
| B — Detección + RCA/ML | Lautaro | `engine/detection`, `engine/rootcause` |
| C — Investigador OpenAI | — | `engine/investigator` |
| D — Producto/UI/demo | — | `apps/web` |
