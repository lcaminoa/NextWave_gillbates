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

## D004 — Renombrar estimated_revenue_loss_usd a estimated_revenue_loss_usd_per_hour

Contexto: Valentin (Stream C) pregunto si `IncidentReport.estimated_revenue_loss_usd` es un
total acumulado o una tasa por hora, porque `IncidentCandidate` ya tenia el campo analogo
llamado `estimated_revenue_loss_usd_per_hour` -- inconsistencia real entre los dos.

Alternativas:
1. dejar `IncidentReport` como un total acumulado desde que arranco el incidente
2. renombrar para que sea la misma tasa por hora que ya calcula `engine/rootcause/candidates.py`

Decision: 2

Por qué: todos los ejemplos numericos del master plan (Sec 12, 17) son tasas ("USD 12,4 mil
por hora", "USD 187/min"), nunca un acumulado. Stream C no tiene que inventar ningun calculo
nuevo: toma `estimated_revenue_loss_usd_per_hour` del `IncidentCandidate` ganador y lo copia
tal cual al `IncidentReport`.

Archivos: contracts/schemas.py, contracts/types.ts.

## D005 — Evidencia contrafactual tambien para candidatos de 2 dimensiones

Contexto: Valentin señalo que `_counterfactual_check` en `engine/rootcause/candidates.py`
solo generaba evidencia contrafactica para candidatos de 1 dimension (`if len(dims) != 1:
return None`), justo cuando los candidatos de 2 dimensiones son los que mas rca_score sacan
en la demo (D003) -- se perdia la evidencia mas fuerte donde mas importaba (master plan Sec 9.5).

Alternativas:
1. dejarlo como esta, solo 1 dimension
2. generalizar: para cada dimension del candidato, fijar las demas dimensiones y comparar
   contra otro valor de esa dimension puntual (1 control por dimension del candidato)

Decision: 2

Por qué: para {provider: nova_pay, country: BR} ahora genera 2 controles -- uno fijando
country=BR y variando provider (descarta "es Brasil en general"), otro fijando provider=nova_pay
y variando country (descarta "es nova_pay en todos lados") -- exactamente el tipo de evidencia
que pide el master plan para el caso de mayor rca_score.

Verificado con: `uv run python -m engine.detection.demo` -- mismos rca_score/confianza/perdida
que antes del cambio (no se toco el scoring), ahora con lineas "contrafactico:" en el candidato
ganador de 2 dimensiones.

## D006 — Calibrar ewma_lambda en la demo (no en el default de produccion)

Contexto: al mergear "connect configurable detection pipeline" (nueva capa de deteccion con
DetectionConfig, WindowAggregator, DetectionEngine y suavizado EWMA sobre el residuo), la demo
end-to-end paso de detectar 5 anomalias a detectar 0 durante el chaos inyectado. Diagnostico:
con solo 2 ventanas (`persistence_windows=2` que usa demo.py para terminar rapido) y el
`ewma_lambda` default de 0.3, el promedio suavizado no llega a cruzar `ewma_threshold=-0.05`
a tiempo -- corriendo mas ventanas seguidas confirma que el mecanismo SI funciona, solo que
necesita mas ventanas de las que la demo corre para "calentar".

Alternativas:
1. bajar `ewma_threshold` globalmente en config.py (mas facil de cruzar, pero mas sensible a
   ruido en produccion real)
2. subir `ewma_lambda` globalmente en config.py (menos suavizado en TODOS los casos, no solo
   en la demo)
3. calibrar `ewma_lambda=0.7` solo en `demo_config` (dentro de demo.py), dejando el default de
   `config.py` sin tocar para uso real

Decision: 3

Por qué: el problema es especifico de que la demo comprime todo en 2 ventanas sinteticas
gigantes; en produccion real (`window_seconds=60` via WindowAggregator/DetectionEngine) van a
pasar muchas mas ventanas antes de que se pida una respuesta, asi que el suavizado con lambda
bajo tiene sentido y no hace falta tocarlo. Cambiar el default global para arreglar un problema
de la demo hubiera sido tapar el sintoma en el lugar equivocado.

Riesgo abierto: no verificamos todavia que los defaults de `config.py` (`ewma_lambda=0.3`,
`ewma_threshold=-0.05`, `persistence_windows=3`) reaccionen razonablemente rapido en una corrida
real de varios minutos contra un chaos inyectado en vivo (el escenario real de "trial by fire").
Antes del hackathon habria que probar `DetectionEngine` con un stream continuo de varios minutos
y confirmar que detecta en un tiempo aceptable, no solo que la demo sintetica pasa.

Verificado con: `uv run python -m engine.detection.demo` -- vuelve a detectar el incidente
inyectado (provider=nova_pay, country=BR) con el mismo rca_score que antes de este merge.

## D007 — Nombrar el `source` del contrafactual por dimension (no siempre "counterfactual_provider")

Contexto: Valentin (Stream C) pidio confirmar como se van a llamar los `source` de los controles
contrafactuales antes de integrar. Al revisar, el codigo generaba SIEMPRE `source="counterfactual_provider"`
para cualquier control, aunque el control fuera de `country` o `payment_method` -- resabio de
cuando el contrafactual solo existia para `provider` (antes de D005).

Decision: nombrar cada `source` dinamicamente como `counterfactual_<dimension>` (ej.
`counterfactual_provider`, `counterfactual_country`). Cada Evidence de control ya estaba (y sigue
estando) incluida en `candidate.evidence_ids`, eso no cambio -- solo el nombre del `source`.

Verificado con: script standalone que corre `generate_candidates` sobre el chaos de la demo y
confirma que para el candidato ganador `{provider: nova_pay, country: BR}` aparecen
`counterfactual_provider` y `counterfactual_country`, ambos con su evidence_id dentro de
`candidate.evidence_ids`.
