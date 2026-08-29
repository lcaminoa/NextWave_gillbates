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

## D004 — Geografía de impacto como globo 3D orientado a evidencia

Alternativas:
1. omitir geografía del Control Tower
2. usar un mapa 2D estático
3. usar un globo 3D interactivo, limitado a países que ya cuentan con evidencia del incidente

Decisión: 3

Por qué:
- el alcance internacional de los pagos se entiende de un vistazo y aporta una señal de producto
  útil durante la demo
- el país es una dimensión ya definida en Evidence, IncidentCandidate y Transaction; el globo
  no requiere campos ni endpoints nuevos
- drag y zoom permiten inspección, pero los marcadores enlazan siempre a una investigación
  existente y no reemplazan la evidencia citable
- en random_unknown no se alimenta el globo con ground truth ni se muestran dimensiones antes
  de que el backend confirme el reveal

Tradeoff: suma una dependencia visual y carga de render. Se usa como pieza principal de
orientación geográfica, con una card de detalle por marcador; aun así no reemplaza el approval
chart ni la evidencia citable, y no incluye arcos decorativos ni telemetría inventada.

## D005 — Detail de incidente como workspace de evidencia

Alternativas:
1. una grilla de muchos KPIs y mini-cards
2. un chat o resumen generado como pantalla principal
3. un hero narrativo seguido por un workspace 68/32: evidencia y diagnóstico a la izquierda,
   timeline de investigación sticky a la derecha

Decisión: 3

Por qué:
- el producto debe defender qué ocurrió y por qué, no solo listar métricas
- los tres bloques de evidencia conservan legibilidad y permiten citar baseline, control de
  proveedor y cambio de decline code sin diluirlos en widgets pequeños
- la timeline muestra únicamente Anomaly e InvestigationStep; construye una historia verificable
  sin exponer razonamiento interno
- el estado inconclusive puede mantener el mismo flujo con hipótesis cercanas y evidencia no
  establecida, sin fingir una causa raíz

Tradeoff: la pantalla es más larga que un resumen de una vista. La jerarquía del hero, el panel
sticky y la recomendación final mantienen el recorrido claro y la acción sigue siendo humana.

Verificado con: `uv run python -m engine.detection.demo` (engine/detection/demo.py).
