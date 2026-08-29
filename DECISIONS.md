# Decision log

Entregable oficial del challenge. Una entrada por decisión importante, completada a medida que
se decide — no al final. El jurado va a preguntar "¿por qué eligieron esto y no lo otro?" y la
respuesta tiene que estar acá.

## D001 — Enfoque de detección

Alternativas:
1. umbral estático
2. Isolation Forest
3. baseline Beta-Binomial estacional + detección secuencial de residuos

Decisión: 3

Por qué:
- la aprobación es una proporción binomial (aprobados/intentados)
- maneja bajo volumen mediante incertidumbre (segmentos chicos = intervalos más anchos)
- es interpretable para la defensa técnica
- admite naturalmente buckets estacionales (hora del día, día de la semana)
- resulta más fácil calibrar falsos positivos

Tradeoff: es menos genérico que ML no supervisado, pero está mejor alineado con la métrica de
pagos.

## D002 — Reconciliar 3 versiones de contratos en una sola fuente de verdad

Alternativas:
1. quedarse con los contratos originales (Transaction/Incident/RootCauseReport/Explanation, 4 entidades)
2. quedarse con los schemas sueltos que subió un compañero (Transaction/Alert/Diagnosis, 3 archivos JSON de ejemplo)
3. adoptar el modelo de `NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md` (8 entidades: Transaction,
   BaselinePoint, Anomaly, Evidence, IncidentCandidate, InvestigationStep, IncidentReport, ChaosSpec)

Decisión: 3

Por qué:
- el master plan viene de research real (competidores, producto real de Yuno, no solo el brief)
- separa Anomaly (señal cruda) de IncidentCandidate (hipótesis de causa), lo que permite tener
  varias hipótesis compitiendo y el estado "inconclusive" cuando ninguna gana con confianza —
  las versiones anteriores no distinguían esto
- separa InvestigationStep de IncidentReport, necesario para mostrar al agente investigando en
  vivo durante la demo, no solo el resultado
- ya define endpoints REST concretos (`/api/incidents`, `/api/chaos/*`), listos para implementar

Tradeoff: son más entidades para mantener sincronizadas entre `types.ts` y `schemas.py`, pero el
mapeo streams -> entidades queda más limpio (cada Stream B/C produce exactamente lo que le toca).

## D003 — Formula de rca_score: multiplicativa, no con penalizacion fija

Contexto: al probar el motor de RCA contra un chaos inyectado (`provider=nova_pay` x
`country=BR`, -45pp), el candidato exacto y correcto (confianza 87%, evidencia contrafactica
clara) obtuvo `rca_score = 0` y quedo invisible detras de una explicacion mas generica pero
menos precisa (`provider=nova_pay` solo, sin el pais). Causa: una penalizacion fija por
"complejidad" (mas dimensiones = mas resta) dominaba el score cuando el volumen absoluto del
segmento era bajo, aunque la señal fuera estadisticamente clarisima.

Alternativas:
1. mantener penalizacion fija por numero de dimensiones, subir el piso de volumen minimo
2. formula puramente multiplicativa (confianza x cobertura x impacto de negocio x
   especificidad), sin resta, con cobertura medida sobre el EXCESO de rechazos vs. baseline
   (no el conteo crudo) y especificidad que premia -- no penaliza -- una combinacion de mas
   dimensiones cuando sigue siendo significativa

Decision: 2

Por qué: la opcion 1 sigue vulnerable a que cualquier segmento real pero de bajo volumen
absoluto quede opacado por uno mas grande pero menos preciso -- exactamente el tipo de falso
negativo que un juez inyectando un incidente nuevo (trial by fire) puede exponer. La opcion 2
se probo contra el chaos simulado y encontro el segmento correcto en primer lugar.

Verificado con: `uv run python -m engine.detection.demo` (engine/detection/demo.py).

## D004 — Construir el investigador contra mocks y guardrails antes de conectar OpenAI

Alternativas:
1. integrar la API primero y validar los reportes despues
2. congelar primero tools de solo lectura, casos mock, timeline, evidencia consultada y validacion
   determinista; luego reemplazar solamente la politica de investigacion por el agente real

Decision: 2

Por qué:
- permite avanzar Stream C sin API key ni bloquearse por disponibilidad de un modelo
- prueba el limite Stream B -> Stream C usando los contratos reales
- obliga a que cada claim cite evidencia existente y realmente consultada
- entrega un fallback determinista si la API falla durante la demo
- deja tools, timeline y `IncidentReport` iguales cuando se conecte Agents SDK o Responses API

Tradeoff: el runner inicial usa una politica simple por confianza y margen; sirve como harness y
fallback, pero no reemplaza la exploracion adaptativa del futuro investigador OpenAI.
