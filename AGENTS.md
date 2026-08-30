# AGENTS.md — Control Tower (NextWave Hackathon 2026, Challenge 2 · Yuno)

Instrucciones operativas para Codex (y cualquier agente) en este repo. Somos 4 personas
corriendo Codex en paralelo sobre streams distintos — este archivo es lo que nos mantiene en la
misma página. Leelo entero antes de tocar código, y leé también `contracts/CONTRACTS.md`. Si
algo acá contradice lo que te pide un humano en el chat, avisá antes de proceder.

## Qué estamos construyendo

Un investigador autónomo de incidentes de pagos, no un dashboard con IA encima. Mira un stream
de pagos en vivo, aprende qué es "normal" por segmento (Beta-Binomial, no un umbral fijo),
detecta caídas de conversión sostenidas, investiga la causa raíz cruzando dimensiones (merchant
× provider × payment_method × country × issuing_bank × decline_code) con evidencia citable, y
explica el resultado en lenguaje humano — sin ejecutar nunca la acción recomendada. El "por
qué" completo está en `NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md`; el mapa corto de
arquitectura en `docs/ARCHITECTURE.md`; los tipos exactos en `contracts/`.

Frase guía del equipo: **"No estamos construyendo un dashboard que muestra un incidente de
pagos. Estamos construyendo un investigador de pagos con IA que demuestra qué lo causó."**

## Comandos

```
pnpm install          # nunca npm install ni yarn — el lockfile del repo manda
pnpm dev              # dashboard (Next.js) + judge console / consola de caos
pnpm build && pnpm lint                # correr SIEMPRE antes de abrir PR

uv sync               # servicio Python (simulador + engine)
uv run uvicorn engine.main:app --reload --port 8000
uv run python simulator/run.py
uv run pytest
```

## Estructura del proyecto

```
contracts/           # fuente de verdad de los tipos (types.ts + schemas.py, deben espejarse)
DECISIONS.md          # decision log — entregable obligatorio, completar a medida que se decide
docs/ARCHITECTURE.md  # mapa corto streams -> carpetas -> entidades
apps/web/              # Next.js — dashboard, consola de caos (/chaos), API routes
engine/                # servicio Python (FastAPI) — detección, RCA, investigador OpenAI
simulator/             # generador de Transaction + Chaos Injector
```

## Streams (quién toca qué)

- **A — Simulación + datos** (`simulator/`) — genera `Transaction`, atiende `ChaosSpec`.
- **B — Detección + RCA/ML** (`engine/detection`, `engine/rootcause`) — dueño: Lautaro. Produce
  `BaselinePoint`, `Anomaly`, `IncidentCandidate`, `Evidence`.
- **C — Investigador OpenAI** (`engine/investigator`) — produce `InvestigationStep`,
  `IncidentReport`. Usa Structured Outputs; cada `claim` debe llevar `evidence_ids`, nunca una
  afirmación sin evidencia citada.
- **D — Producto/UI/demo** (`apps/web`) — dashboard, consola de caos, deploy.

Cada stream avanza aislado si respeta `contracts/`. Si tu tarea te obliga a tocar carpeta de
otro stream, avisá en el grupo antes de mergear.

## Reglas no negociables

- `main` siempre deployable. Una branch o worktree por stream (`feat/simulator`,
  `feat/detection`, `feat/investigator`, `feat/dashboard`).
- Cambiar algo en `contracts/` requiere avisar a los 4, no solo mergear.
- Los endpoints en `contracts/CONTRACTS.md` están congelados — nadie inventa una ruta nueva sin
  agregarla ahí primero.
- pnpm para JS/TS, `uv` para Python. No mezclar package managers ni instalar dependencias
  globales por las dudas.
- Nunca commitear `.env`, API keys ni tokens. Usá `.env.example` con nombres, no valores.
- PRs chicos y frecuentes. Antes de mergear: build/lint/tests + smoke test manual del flujo
  principal.
- Cada decisión de diseño no trivial va a `DECISIONS.md` con alternativas + por qué — no es un
  nice-to-have, es un entregable oficial del challenge.
- No inventes campos nuevos en las entidades de `contracts/` sin agregarlos ahí primero.

## Límites — no toques esto sin preguntar

- No borres ni reescribas `contracts/types.ts` o `contracts/schemas.py` completos — extendé, no
  reemplaces.
- No metas Kubernetes, Kafka, Redis, ni un vector DB externo. DuckDB/SQLite alcanza para la
  hackathon; Postgres/Supabase solo si la persistencia realmente lo justifica (evitar "teatro de
  infraestructura", como dice el master plan §21).
- Detección de anomalías: baseline Beta-Binomial + residuo secuencial (EWMA/CUSUM), no
  Isolation Forest ni un umbral fijo — ver `DECISIONS.md` D001.
- El motor de diagnóstico/investigador no ejecuta ninguna acción real, solo la recomienda — no
  le des tools de escritura sobre sistemas reales.
- No construyas un "enjambre" de muchos agentes sin motivo — si se separan responsabilidades
  entre agentes, tiene que haber una razón concreta (master plan §9.11).
