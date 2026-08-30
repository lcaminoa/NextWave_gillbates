# Decision log

Entregable oficial del challenge. Una entrada por decisión importante, completada a medida que
se decide — no al final. El jurado va a preguntar "¿por qué eligieron esto y no lo otro?" y la
respuesta tiene que estar acá.

## D001 — Enfoque de detección

Alternativas:
1. umbral estático
2. Isolation Forest
3. baseline Beta-Binomial con soporte para estacionalidad + detección secuencial de residuos

Decisión: 3

Por qué:
- la aprobación es una proporción binomial (aprobados/intentados)
- maneja bajo volumen mediante incertidumbre (segmentos chicos = intervalos más anchos)
- es interpretable para la defensa técnica
- admite incorporar buckets estacionales (hora del día, día de la semana) sin reemplazar el
  modelo estadístico
- resulta más fácil calibrar falsos positivos

Tradeoff: es menos genérico que ML no supervisado, pero está mejor alineado con la métrica de
pagos.

Estado de implementación (agosto 2026): el baseline actual ya es Beta-Binomial, pero todavía
usa toda la historia bootstrap del segmento y la mantiene fija durante una corrida. Los buckets
de hora/día y el fallback jerárquico son la siguiente mejora; no se presentan como si ya
estuvieran en producción.

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

## D005 — Un solo investigador con tools directas y Structured Outputs

Alternativas:
1. un enjambre de agentes especializados
2. un investigador con Responses API, tools de solo lectura y salida estructurada
3. Programmatic Tool Calling desde la primera version

Decision: 2

Por qué:
- cada consulta puede cambiar el siguiente paso, y los resultados intermedios son chicos
- mantiene una sola superficie de tools acotada, auditable y sin efectos secundarios
- Pydantic/Structured Outputs controla la forma; la validacion local controla evidencia,
  umbrales, impacto financiero y revision humana
- permite comparar mas adelante tools directas contra Programmatic Tool Calling con los mismos
  casos de evaluacion, sin agregar complejidad antes de demostrar una mejora

Tradeoff: requiere varias vueltas de API por investigacion. Se limita a 8 tools y 10 turnos de
modelo; el runner determinista queda disponible como fallback para la demo.

## D006 — Validar nombres tecnicos generados y permitir una sola reparacion

Contexto: en la primera integracion real Stream B -> OpenAI, el reporte eligio correctamente
`nova_pay x BR` y cito evidencia valida, pero escribio `nueva_pay` al nombrar una alternativa.
La validacion de citas no alcanza para detectar una entidad tecnica deformada en el texto.

Alternativas:
1. confiar en la salida estructurada y las citas
2. renderizar todo el texto de forma determinista
3. validar tokens tecnicos contra candidatos/evidencia y permitir un unico reintento acotado

Decision: 3

Por qué:
- conserva la explicacion adaptativa del modelo sin permitir nombres tecnicos inventados
- el error se detecta localmente antes de publicar el reporte
- un solo reintento evita loops y gasto impredecible; si vuelve a fallar, el reporte se rechaza

Verificado con cuatro corridas reales usando `gpt-5.6-terra`: caso claro `confirmed`, caso
ambiguo `inconclusive`, caso sin candidatos `inconclusive` y pipeline Stream B -> C `probable`
con ganador `provider=nova_pay x country=BR`.

## D007 — Renombrar estimated_revenue_loss_usd a estimated_revenue_loss_usd_per_hour

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

## D008 — Evidencia contrafactual tambien para candidatos de 2 dimensiones

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

## D009 — Calibrar ewma_lambda en la demo (no en el default de produccion)

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

## D010 — Nombrar el `source` del contrafactual por dimension (no siempre "counterfactual_provider")

Contexto: Valentin (Stream C) pidio confirmar como se van a llamar los `source` de los controles
contrafactuales antes de integrar. Al revisar, el codigo generaba SIEMPRE `source="counterfactual_provider"`
para cualquier control, aunque el control fuera de `country` o `payment_method` -- resabio de
cuando el contrafactual solo existia para `provider` (antes de D008).

Decision: nombrar cada `source` dinamicamente como `counterfactual_<dimension>` (ej.
`counterfactual_provider`, `counterfactual_country`). Cada Evidence de control ya estaba (y sigue
estando) incluida en `candidate.evidence_ids`, eso no cambio -- solo el nombre del `source`.

Verificado con: script standalone que corre `generate_candidates` sobre el chaos de la demo y
confirma que para el candidato ganador `{provider: nova_pay, country: BR}` aparecen
`counterfactual_provider` y `counterfactual_country`, ambos con su evidence_id dentro de
`candidate.evidence_ids`.

## D011 — Pipeline automatico (DetectionEngine -> mix-shift -> generate_candidates)

Contexto: hasta ahora estas 3 piezas se llamaban a mano, una por una, como hace demo.py.
Un companero (Pancho, tomando simulator/) pidio conectarlas solas para que Stream C consuma
una sola salida por ventana, sin orquestar el pipeline el mismo. Pidio explicitamente NO
rehacer el RCA que ya esta en candidates.py, y no tocar contracts/ sin avisar a todos.

Decision: nuevo modulo `engine/detection/pipeline.py` con `DetectionPipeline` (envuelve
`DetectionEngine`) y dos dataclasses internas -- `WindowResult` (una por ventana cerrada) y
`AnomalyDiagnosis` (anomalia + candidatos + evidencia) -- construidas 100% con los tipos ya
compartidos (`Anomaly`, `IncidentCandidate`, `Evidence`). No se toco contracts/schemas.py.

Dos limitaciones a proposito, documentadas para que Stream C las conozca de entrada:

1. `mix_shift.decompose()` explica UNA dimension a la vez (Sec 9.3). Una Anomaly de "global"
   o de 2+ dimensiones combinadas no tiene una unica dimension que decomponer -- ahi
   `mix_shift_effect_pp`/`performance_effect_pp` quedan en `None` en vez de inventar a cual
   dimension aplicarselo.
2. `generate_candidates()` busca en TODA la ventana, no filtra por la anomalia que lo
   disparo (asi funcionaba antes de este cambio, no se toco). Si hay 2 incidentes
   simultaneos en la misma ventana, CADA diagnostico recibe la MISMA lista de candidatos
   (todos los segmentos problematicos de esa ventana, no solo el propio). Verificado con
   test que ambos incidentes aparecen en la lista y que no se inventa ninguna combinacion
   cruzada que no existio en los datos (`tests/detection/test_pipeline.py`).

Ademas se agrego evidencia citable de `decline_code_distribution` (motivo tipico de rechazo
del segmento, no solo que subieron los rechazos) en `candidates.py`, reusando el calculo que
ya existia para `dominant_decline_code`.

Riesgo abierto D009 (defaults de produccion sin probar contra un stream real) ahora CERRADO:
`tests/detection/test_pipeline.py::ProductionDefaultsLongStreamTests` corre un stream real
via `DetectionPipeline` con los defaults de `config.py` sin calibrar (los mismos que usaria
produccion) y confirma que un incidente de -35pp se detecta en la ventana 3 de 4 (exactamente
lo esperado por `persistence_windows=3`).

Verificado con: `uv run python -m unittest discover -s tests/detection -v` (11 tests, OK) y
`uv run python -m engine.detection.demo` (mismo resultado de siempre, mas evidencia de codigo
de rechazo).

## D012 — Normalizar el signo de `ChaosSpec.severity_pp` en el simulador

Contexto: `contracts/CONTRACTS.md` describe la severidad como una degradación negativa (por
ejemplo, `-35` pp), mientras que el mock de detección y la consola interactiva existente usan
`35` y luego lo restan. Ambas convenciones ya estaban presentes y la API/UI todavía se integran.

Alternativas:
1. elegir solo una convención ahora y rechazar la otra;
2. aceptar ambos signos dentro del simulador y convertirlos a una caída usando su valor absoluto.

Decisión: 2.

Por qué: el significado de producto es inequívoco — una severidad representa una caída — y
aceptar ambas formas evita romper los flujos de test ya existentes o forzar a Valen/Franco a
conocer una inconsistencia histórica. La salida conserva el valor original para que la API pueda
mostrar exactamente lo que recibió.

Límite: el simulador valida una magnitud entre 1 y 95 pp y aplica una tasa de aprobación mínima
de 1 %, incluso si se superponen dos ChaosSpec.

## D013 — Chaos aleatorio sobre segmentos detectables, no sobre el cruce total

Alternativas:
1. elegir al azar las cinco dimensiones disponibles (merchant, provider, país, método y emisor);
2. elegir un segmento aleatorio de una a tres dimensiones con volumen suficiente.

Decisión: 2.

Por qué: un cruce de cinco dimensiones aparece muy pocas veces incluso con 1.200 transacciones
por minuto, por lo que puede quedar debajo de `min_volume` y la prueba a ciegas parecería un
falso negativo del producto. El injector elige proveedor, proveedor × país, proveedor × país ×
método, emisor o comercio. Sigue siendo desconocido para el equipo, pero es estadísticamente
observable y permite evaluar de verdad detección y RCA.


## D014 — Ownership de candidatos por anomalia (filtro pedido por Stream C)

Contexto: D011 dejo documentado que `generate_candidates()` busca en TODA la ventana y
devuelve la MISMA lista para cualquier anomalia que la pida -- con 2+ incidentes
concurrentes en la misma ventana, un `AnomalyDiagnosis` podia terminar mostrando el
candidato mas fuerte de OTRO incidente. Valentin (Stream C) lo detecto: su Investigator
filtra por `anomaly_id`, pero como `generate_candidates()` le pone el `anomaly_id` de quien
pregunta a TODA la lista, no podia distinguir cuales candidatos eran conceptualmente del
incidente que esta investigando -- riesgo real de que el agente eligiera y duplicara la
causa de un incidente que no es el suyo.

Alternativas:
1. hacer que `generate_candidates()` reciba y filtre por segmento desde el vamos (tocaria
   `candidates.py`, que el equipo pidio explicitamente no rehacer);
2. filtrar en `engine/detection/pipeline.py`, DESPUES de generar los candidatos de la
   ventana, quedandome solo con los que le "pertenecen" a cada anomalia.

Decision: 2. No se toco `candidates.py` ni `contracts/`.

Regla de ownership (`_owns_candidate` en pipeline.py): un candidato le pertenece a una
anomalia si, para cada dimension que AMBOS especifican, los valores coinciden (nunca se
acepta un candidato que contradiga una dimension ya fijada por la anomalia), Y comparten
al menos una dimension (si no comparten ninguna, no se puede confirmar que sea el mismo
incidente). Una anomalia "global" (sin dimensiones propias) acepta cualquier candidato.
`evidence` se recorta junto con `candidates`, a solo la citada por los que quedaron.

Limite honesto: NO se exige que el candidato cubra TODAS las dimensiones de la anomalia
(una anomalia de 3 dimensiones se quedaria sin ningun candidato, porque
`generate_candidates()` busca como maximo `config.rca_max_dimensions` = 2 por defecto). Y
un candidato que no comparte NINGUNA dimension con la anomalia (ej. solo
payment_method+issuing_bank contra una anomalia de provider+country) queda afuera de esa
diagnosis aunque en los datos reales resulte ser el mismo incidente real -- se prefiere
sub-cubrir (perder algun candidato legitimo) antes que sobre-atribuir (mostrarle a Stream C
la causa de un incidente que no es el que esta investigando).

Verificado con: `tests/detection/test_pipeline.py::TwoSimultaneousIncidentsTests` ahora
confirma que cada `AnomalyDiagnosis` NO contiene ningun candidato del otro incidente (antes
solo confirmaba que no se inventaba una combinacion cruzada), y que la evidencia de cada
diagnosis es exactamente la citada por sus propios candidatos. Los 18 tests del repo siguen
pasando; `demo.py` no cambia (llama a `generate_candidates()` directo, sin pipeline, a
proposito no filtra -- es una demo de UN solo incidente).

## D015 — Agregar un Evidence Auditor independiente, sin tools ni capacidad de reparacion

Contexto: los validadores deterministas comprueban que cada claim cite evidencia existente y
consultada, pero no pueden decidir si el texto de esa evidencia realmente alcanza para sostener
la interpretacion escrita por el modelo. Un ID valido podria citarse para justificar una
conclusion semanticamente mas fuerte que los datos.

Alternativas:
1. confiar solo en el Investigator y los validadores deterministas
2. crear varios agentes especializados que repitan la investigacion
3. agregar un segundo agente acotado que reciba el reporte terminado y su paquete auditable, y
   emita una decision estructurada de aprobar o rechazar

Decision: 3

Por qué:
- cubre el hueco semantico sin duplicar el acceso a datos ni la exploracion de hipotesis
- no tiene tools, no modifica el reporte y no ejecuta acciones
- usa una sola llamada estructurada y solo ve evidencia que el Investigator consulto
- su salida tambien se valida localmente: no puede referenciar evidencias o claims inexistentes
- un rechazo queda explicito para revision humana; no dispara loops autonomos impredecibles

Tradeoff: agrega latencia y costo de una llamada por reporte auditado. Por eso el runner
determinista sigue disponible y la auditoria se mantiene separada de `IncidentReport` hasta que
el backend/UI definan como representar el estado de publicacion.

Verificado con `gpt-5.6-terra`: el Auditor rechazo correctamente una afirmacion de "aislamiento"
demasiado fuerte y aprobo el mismo caso al reformularla como "hipotesis con mayor respaldo",
sin cambiar los datos ni el ganador.

## D016 — Un unico runtime en memoria y SSE de solo transacciones para el primer flujo API

Contexto: simulador, deteccion/RCA e investigador ya existian, pero faltaba conectarlos a los
siete endpoints congelados. Crear un simulador por cliente SSE avanzaria el RNG y el pipeline
varias veces, produciria transacciones distintas para cada pantalla y podria desordenar el
detector. Tampoco esta definido en contratos un envelope para el detalle del incidente.

Alternativas:
1. crear el simulador y el pipeline dentro de cada request o conexion SSE;
2. mantener un unico runtime del proceso con un productor, un pipeline y un store en memoria;
3. agregar desde ahora un broker externo y persistencia distribuida.

Decision: 2. `ControlTowerService` posee una instancia live de `PaymentSimulator`, una de
`DetectionPipeline` y un store en memoria. Un broker local distribuye cada `Transaction` por
SSE con colas acotadas, sin dejar que un cliente lento frene al detector. Un simulador separado
genera solamente el historial bootstrap. El endpoint de detalle usa el envelope local
`{report, candidates, evidence, investigation_steps}` sin agregar campos a las ocho entidades
compartidas. El SSE transporta solamente `Transaction`; no mezcla pasos del agente en una ruta
que el contrato ya congelo para pagos.

La inyeccion manual se normaliza al reloj virtual actual para que el click signifique "empezar
ahora" aun cuando la demo acelera el tiempo. `random_unknown` responde exclusivamente con
`public_spec(chaos_id)`; el `ChaosSpec` interno nunca se serializa, almacena como incidente ni se
entrega al detector o al investigador.

Como el replay acelera el reloj de transacciones, el adaptador alinea `generated_at` y los
timestamps de `InvestigationStep` con `Anomaly.detected_at` cuando el reloj virtual ya avanzo por
delante del reloj de pared. Sin esa normalizacion, la UI podria mostrar un reporte "anterior" al
incidente que lo genero.

Tradeoffs: el estado se pierde al reiniciar el proceso y el replay SSE es corto. Es suficiente
para la hackathon y evita infraestructura sin valor de producto. La primera integracion usa el
investigador determinista para probar el recorrido sin llamadas reales. El runtime ya ejecuta la
generacion y deteccion/RCA en un productor dedicado, y la investigacion en otro worker, para que
un cierre de ventana costoso o una llamada lenta no congelen SSE ni endpoints. Activar OpenAI y el
Evidence Auditor requiere elegir la configuracion de runtime y una decision de UI sobre el estado
de publicacion del audit.

Los endpoints de caos admiten un `CONTROL_TOWER_JUDGE_TOKEN` opcional y, cuando esta configurado,
exigen el header `X-Control-Tower-Judge-Key`. Tambien limitan cada duracion a 60 minutos, rechazan
IDs repetidos y aceptan como maximo 20 inyecciones por sesion. Antes de exponer el backend en una
URL publica, `CONTROL_TOWER_PUBLIC_MODE=true` obliga a configurar un token no vacio de al menos 16
caracteres y el proceso se niega a iniciar si falta; sin ese modo, el flujo local sigue siendo facil
de usar. El despliegue debe correr un solo worker/replica mientras el estado sea en memoria.

## D017 — Deduplicar por episodio y abstenerse ante cobertura RCA incompleta

Contexto: Stream B crea un `anomaly_id` nuevo en cada ventana sostenida, por lo que derivar el
`incident_id` solamente de ese campo duplicaria el mismo incidente. Ademas, el detector puede
emitir una anomalia de tres dimensiones mientras el RCA busca candidatos de hasta dos; un
candidato parcial podria parecer convincente sin explicar todo el segmento detectado.

Decision: el runtime considera activo un episodio por un fingerprint canonico de la raiz RCA
directa; cuando todavia no existe una raiz defendible, conserva la clave observada de la
`Anomaly` como identidad provisional. Ventanas consecutivas compatibles reutilizan el incidente;
dos ventanas sin evidencia que identifique ese episodio liberan la clave y permiten que una
recurrencia posterior cree otro. Ese margen evita confundir una ventana de bajo volumen con
recuperacion. Antes de publicar una ganadora se exige que al menos un candidato cubra todas las
dimensiones fijadas por la anomalia, y la ganadora elegida tambien debe cumplirlo. Si no ocurre,
se publica un reporte valido `inconclusive`, sin ganador ni claims inventados, y los candidatos
parciales quedan visibles solo como material de revision en el detalle.

La salida del investigador se vuelve a validar en el limite de publicacion. Un error transitorio
o una salida invalida genera un fallback `inconclusive`, pero queda marcado internamente para
reintentar en la siguiente ventana del mismo episodio; si el reintento es valido reemplaza el
fallback en vez de crear un segundo incidente.

Antes de deduplicar entre ventanas, cada diagnostico propone como raiz solamente su candidato con
mayor `rca_score` que tenga toda su evidencia presente. Un diagnostico es ancla directa si esa raiz
coincide exactamente con el segmento de su `Anomaly`; los sintomas cuya propuesta contiene una
sola ancla se absorben en ella. Un candidato secundario nunca une grupos, y un sintoma compatible
con dos anclas se descarta para el agrupamiento en vez de fusionar causas independientes. Si hay
diagnosticos segmentados, `global` no participa porque su pool amplio tampoco permite asignar
ownership con seguridad.

El fingerprint queda atado a la raiz, no al impacto del representante. Entre ventanas, una
proyeccion nueva solo reutiliza un episodio activo cuando tiene un unico match jerarquico; si puede
corresponder a dos episodios activos, conserva ambos y no crea un tercero. Asi una caida de provider
no se publica tambien por country, bank, merchant e intersecciones, mientras dos incidentes
cruzados no quedan unidos por una hipotesis puente debil.

Por que: preferimos sub-atribuir y pedir revision humana antes que presentar una proyeccion 1D/2D
como explicacion completa de una anomalia 3D. No cambia `contracts/` ni obliga a Stream B a ampliar
`rca_max_dimensions` durante la integracion.

Verificado con tests API de deduplicacion, recurrencia, cambio de proyeccion jerarquica, incidentes
cruzados, dos diagnosticos simultaneos, ambiguedad entre episodios activos y fallback 3D, mas
corridas reales de 2.400 transacciones a traves de simulador -> pipeline -> investigador ->
endpoints de incidentes. Una caida global de `provider=nova_pay`, que sin consolidacion producia
muchos sintomas publicables, queda en un reporte.

## D018 — Auditor como gate y evidencia incremental para publicar causas especificas

Contexto: en un smoke a ciegas, un caos real de `merchant=Comercio2` termino explicado como
`merchant=Comercio2|provider=stripe`. El merchant era correcto, pero el reporte agrego una
dimension que no mejoraba materialmente la explicacion simple. Ademas, D015 habia dejado al
Evidence Auditor disponible como runner separado, pero todavia no era una compuerta del runtime.

Alternativas:
1. conservar el ranking y el Auditor como utilidades independientes;
2. darle al Auditor transacciones crudas o la verdad secreta del `ChaosSpec` para decidir;
3. filtrar intersecciones no demostradas y, en modo OpenAI auditado, exigir aprobacion sobre un
   paquete acotado de anomalía, candidatos relevantes, evidencia consultada, reporte y pasos.

Decision: 3. Si una candidata agrega dimensiones frente a una explicacion propia mas simple,
debe mejorar su `current_decline_rate` por al menos 8 puntos porcentuales y tener un control
`counterfactual_<dimension>` citable y consultado para cada dimension agregada. Si no cumple, no
participa como posible ganadora; la investigacion elige la alternativa simple o se abstiene. El
validador de publicacion repite la regla para que un runner inyectado tampoco pueda saltearla.

El modo `audited_openai` ejecuta Investigator -> validacion determinista -> Evidence Auditor ->
publicacion. Un rechazo, una salida invalida o una falla de la llamada produce un reporte local
`inconclusive`, conserva revision humana y deja el episodio habilitado para retry sin duplicarlo.
El modo deterministico sigue siendo el default y no realiza llamadas externas.

Cada request del Investigator y del Auditor tiene un timeout explicito configurable con
`OPENAI_REQUEST_TIMEOUT_SECONDS` (30 segundos por default). Los reintentos internos del SDK se
desactivan: ante timeout el runtime falla cerrado y el retry controlado ocurre recien en una nueva
ventana del mismo episodio, sin bloquear SSE ni multiplicar llamadas fuera de nuestra politica.

El paquete del Auditor contiene la `Anomaly`, ganador, alternativas propias mas simples y principal
competidora con `confidence`, `rca_score`, impacto, `evidence_ids` y `counterfactual_check`; la
evidencia sigue limitada a IDs efectivamente consultados. Nunca recibe `ChaosSpec`, dimensiones
secretas del random, transacciones crudas, tools ni capacidad de modificar el reporte.

Tradeoff: el umbral de 8 pp privilegia evitar una explicacion vistosa pero falsa y puede volver
`inconclusive` un incidente real con poco volumen. Para la prueba a ciegas es preferible
sub-atribuir; el valor queda centralizado y puede recalibrarse con escenarios reproducibles sin
cambiar contratos.

## D019 — Elegibilidad de publicacion por volumen y competencia RCA independiente

Contexto: en una corrida real de `PaymentSimulator -> DetectionPipeline -> RCA -> Investigator`,
una inyeccion de 35 pp sobre `issuing_bank=nubank` fue detectada de forma sostenida: 68 intentos,
35,3% de rechazo observado contra 14,7% de baseline. Sin embargo, el Investigator la publico
como `inconclusive`. La formula de `confidence` dio 58,3% y el minimo fijo era 65%, aunque el
RCA la rankeo primera con margen de score suficiente. En otras semillas, una interseccion de
menos de 20 intentos podia quedar primera y bloquear una causa amplia con volumen, o una variante
`bank x payment_method` podia contar como competidora de la misma causa `bank`.

Alternativas:
1. conservar el minimo de 65% y aceptar que una anomalia ya confirmada se abstenga;
2. bajar `rca_min_segment_volume` en Stream B para que las intersecciones chicas compitan mejor;
3. antes de publicar, descartar solo de la competencia los candidatos con menos de 20 intentos,
   comparar una causa contra alternativas independientes (no sus refinamientos), y usar un
   minimo de confidence de 50% junto con los guardrails existentes.

Decision: 3.

Por que: `confidence` es la fraccion del rechazo observado que excede el baseline propio; no es
la probabilidad calibrada de que una causa sea verdadera. La deteccion ya exige breach del
intervalo Beta-Binomial, EWMA negativo y persistencia. Para publicar se conservan volumen minimo,
evidencia citable, guardrail de especificidad y margen RCA; los segmentos chicos siguen visibles
en el detalle pero no pueden suprimir una causa amplia. Una interseccion que solo agrega
dimensiones a la ganadora es evidencia de detalle, no una explicacion rival.

Tradeoff: un umbral de 50% puede publicar causas con menor contraste relativo que antes, pero
solo despues de los filtros estadisticos de Stream B y de la comparacion RCA. Preferimos esa
calibracion a negar un incidente sostenido de volumen suficiente por aplicar dos veces un umbral
no calibrado. No cambia contratos ni permite remediacion automatica.

Verificado con una prueba end-to-end reproducible de cuatro inyecciones de 35 pp (provider,
provider x country, merchant e issuing_bank), usando el simulador y pipeline reales; las cuatro
producen una causa `probable` o `confirmed` que coincide exactamente con la inyeccion.

## D020 — Memoria histórica estructurada, posterior a RCA y sin valor probatorio

Contexto: el contrato ya incluía `IncidentReport.matches_past_incident_id` como SHOULD (§9.10),
pero el runtime no conservaba incidentes entre episodios. El plan sugiere huella estructurada más
embedding, aunque para la hackathon un match semántico sin controles podía insinuar una causa
pasada como si fuera evidencia de la caída actual.

Alternativas:
1. sumar embeddings y búsqueda vectorial desde el primer corte;
2. guardar resúmenes libres en memoria y entregárselos directamente al LLM;
3. usar SQLite con una huella estructurada conservadora y publicar solo un ID de contexto.

Decisión: 3. Cuando un episodio termina tras sus ventanas sanas de gracia, se persiste solo si
terminó `confirmed` o `probable` con candidata ganadora. La huella contiene dimensiones exactas de
la raíz, decline code dominante, magnitud de caída, banda horaria e impacto. Una recurrencia debe
tener las mismas dimensiones, un código compatible y una caída dentro de 15 pp; entonces el
runtime completa `matches_past_incident_id`. La memoria nunca participa en Detection/RCA, no
cambia score/confidence/recommended_action, no agrega `evidence_ids`, ni puede ser escrito por el
LLM. Si SQLite falla, se registra el error y el incidente actual continúa normalmente.

La base se configura con `CONTROL_TOWER_MEMORY_DB`; fuera de una configuración explícita usa
memoria efímera, y `.env.example` propone `data/control_tower_memory.sqlite3`. No se agrega un
endpoint ni se cambia `contracts/`.

Tradeoff: este corte puede perder recurrencias relacionadas pero no idénticas y todavía no usa
embeddings. Preferimos un falso negativo histórico antes que una similitud atractiva que parezca
prueba. La UI todavía debe mostrar el contexto con la etiqueta explícita "memoria, no evidencia".

Verificado con tests de persistencia SQLite, mecanismo de decline conflictivo, raíz distinta,
reporte inconcluso y recuperación -> recurrencia a través de `ControlTowerService`; los claims de
la recurrencia conservan únicamente evidencia del incidente nuevo.

## D021 — Política de detección vigente: parámetros explícitos y dos carriles de volumen

Contexto: el primer borrador del decision log dejaba como “por decidir” tamaño de ventana,
volumen mínimo y umbral EWMA. Ya no corresponde: esos valores existen en
`engine/detection/config.py`, se usan por default en `DetectionPipeline` y están cubiertos por
tests. Esta entrada es la ficha de calibración real del MVP, no una aspiración futura.

| Componente | Valor vigente | Cómo se usa |
| --- | --- | --- |
| Ventana de agregación | `60 s` | `WindowAggregator` cierra ventanas fijas de un minuto. |
| Volumen mínimo de detección | `20` transacciones por segmento y ventana | Por debajo no se actualiza ni publica la señal del segmento. |
| Baseline | Beta-Binomial con prior débil `Beta(2,2)` | Calcula aprobación esperada e intervalo creíble por segmento. |
| Intervalo creíble | `95 %` | Una caída debe quedar por debajo de su límite inferior (percentil 2,5 %). |
| EWMA | `lambda = 0.30` | Suaviza el residuo `aprobación observada - aprobación esperada`. |
| Umbral EWMA | `-0.05` (−5 pp) | El residuo suavizado debe caer por debajo de −5 pp. |
| Persistencia | `3` ventanas consecutivas | Evita publicar un pico aislado de ruido. |
| RCA exploratorio | mínimo `5` transacciones; hasta `2D` | Permite mostrar hipótesis chicas, sin declarar una causa todavía. |
| RCA publicable | volumen estimado `>=20` | El Investigador no publica una causa sustentada solo por un slice muy chico. |

Decisión: mantener esta política como configuración de producción del MVP. La demo comprimida
usa una excepción local (`persistence_windows=2`, `ewma_lambda=0.7`) únicamente para terminar
rápido; no redefine los defaults.

Por qué: una alerta confirmada exige **todas** estas condiciones, no solo lambda: volumen
suficiente, observación bajo el intervalo creíble, EWMA bajo −5 pp y tres ventanas consecutivas.
En el stream continuo reproducible de 10 transacciones por segundo, una caída inyectada de 35 pp
en `provider=nova_pay × country=BR` se confirma en la tercera ventana; el test permite hasta la
cuarta como límite de regresión.

Tradeoff: un incidente muy abrupto sigue esperando tres minutos para ser confirmado. Preferimos
esa demora a publicar una alarma por una sola ventana mala. Los incidentes leves o de bajo
volumen pueden tardar más o quedar `inconclusive`.

## D022 — EWMA como detector secuencial del MVP; CUSUM queda como evolución medida

Alternativas:
1. CUSUM con slack `k` y umbral `h`.
2. EWMA sobre el residuo de aprobación con `lambda=0.30` y threshold `-0.05`.

Decisión: 2.

Por qué: el EWMA actual tiene dos parámetros visibles y explicables: cuánto recuerdo conserva
(`lambda`) y qué caída suavizada preocupa (−5 pp). Combinado con el intervalo Beta-Binomial y la
persistencia, el operador puede explicar la alerta como “la aprobación quedó fuera de lo normal y
la caída se sostuvo”, no como un acumulador abstracto.

Qué perdemos: CUSUM suele ser más sensible a drifts pequeños y prolongados. El MVP puede no
detectar pronto una degradación de ~2 pp durante muchos minutos. Si el producto necesitara ese
caso, se compararía CUSUM contra este baseline con las mismas semillas y una métrica explícita de
falsos positivos/detección, no se reemplazaría por intuición.

## D023 — El detector observa algunos 3D; el RCA solo afirma causas hasta 2D

El primer documento lo resumía como “escaneo hasta 2D”. El código real separa dos preguntas:
qué síntomas observa el detector y qué causa se anima a publicar el RCA.

- **Detección:** global, cada dimensión por separado (`provider`, `country`,
  `payment_method`, `issuing_bank`, `merchant`), `provider × country` y
  `provider × country × payment_method`.
- **RCA:** explora combinaciones de una o dos dimensiones (`rca_max_dimensions=2`).

Decisión: conservar esta asimetría y abstenerse si el síntoma 3D no tiene una causa 1D/2D que
cubra todas sus dimensiones con evidencia suficiente.

Por qué: el detector puede advertir una zona muy específica sin fingir que ya conoce la causa.
El RCA trabaja con más combinaciones y necesita volumen, controles contrafácticos y comparación
con baseline; ampliar indiscriminadamente a 3D dispara la cantidad de segmentos minúsculos.

Tradeoff: un problema realmente `provider × country × payment_method` puede terminar como
`inconclusive` aunque exista la señal 3D. Es una abstención honesta, preferible a atribuirle una
causa 2D que parezca completa pero no lo sea.

## D024 — Ventanas de un minuto fijas, no cinco minutos ni tamaño dinámico

Alternativas:
1. Ventanas dinámicas o de cinco minutos para concentrar volumen.
2. Ventanas fijas de un minuto y política de elegibilidad por volumen.

Decisión: 2 (`window_seconds=60`, `min_volume=20`).

Por qué: en la demo y el runtime, un minuto permite confirmar una caída sostenida en el orden de
tres minutos y hace visible el avance del incidente. En lugar de retrasar a todos los segmentos
por los de poco tráfico, los segmentos que no alcanzan 20 intentos no alertan hasta tener
información suficiente.

Qué perdemos: un segmento de bajo tráfico puede pasar varias ventanas sin ser evaluable. No se
“rellena” con certeza artificial: el intervalo amplio y el filtro de volumen expresan justamente
esa falta de información. Una ventana adaptativa o de cinco minutos sigue siendo una posible
evolución si la telemetría real muestra demasiados segmentos descartados.

## D025 — Baseline por segmento con bootstrap estable; estacionalidad y fallback son pendientes

Alternativas:
1. Actualizar el baseline continuamente con todas las ventanas, incluyendo las incidentadas.
2. Inicializarlo con historia sana bootstrap y mantenerlo estable durante la corrida.
3. Incorporar ya buckets hora/día y fallback jerárquico.

Decisión: 2 por ahora.

Por qué: si una caída larga se agrega inmediatamente al baseline, el sistema aprende que el
incidente es “normal” y deja de verlo. Mantener la referencia sana fija evita esa contaminación
durante una demo o replay corto. El baseline se calcula para el segmento pedido, por lo que no es
un promedio global plano, pero aún no hay filtro temporal ni fallback automático entre niveles.

Tradeoff: el comportamiento horario o semanal real no está modelado todavía; comparar una noche
con una tarde puede ser injusto si el bootstrap no representa ambas. Esto reemplaza la afirmación
anterior de que la estacionalidad ya estaba implementada: está soportada por el diseño, pero
pendiente en el código.

## D026 — Mix shift informa la investigación, pero todavía no bloquea una alerta

Decisión: calcular `mix_shift_effect_pp` y `performance_effect_pp` para anomalías de una sola
dimensión, y no usarlo aún como gate de publicación.

Por qué: la descomposición separa “cambió la mezcla de tráfico” de “empeoró el rendimiento dentro
de los segmentos”. Para una anomalía global o de dos o más dimensiones no existe una única
dimensión a descomponer sin introducir una elección arbitraria; esos campos quedan en `None`.

Tradeoff: hoy un cambio de mezcla puro puede disparar la alerta estadística aunque el diagnóstico
posterior muestre que no hubo degradación de performance. El cálculo está integrado y probado,
pero falta convertirlo en filtro real antes de afirmar que el caso de mix shift puro está cerrado
end-to-end.

## D027 — Hipótesis RCA pequeñas son visibles; publicar una causa exige evidencia adicional

Decisión: separar el umbral exploratorio del umbral de publicación.

- El RCA puede generar una hipótesis de segmento con cinco transacciones: sirve para que el
  operador vea dónde mirar.
- El Investigador solo puede publicar una causa con volumen estimado de al menos 20,
  `confidence >= 0.50`, margen RCA suficiente, evidencia citada y controles de especificidad.
- Una intersección que agrega una dimensión solo puede ganar si mejora el decline rate al menos
  8 pp y cada dimensión adicional tiene un contrafáctico citable y consultado.

Por qué: un candidato muy específico puede tener un ratio impresionante por azar. Mostrarlo como
hipótesis conserva señal; usarlo como veredicto sin volumen ni controles sería sobre-atribuir.

Tradeoff: la política puede publicar `inconclusive` ante una causa real pero todavía pequeña, o
preferir `provider=nova_pay` frente a `provider=nova_pay × country=BR` si Brasil no agrega
evidencia incremental. El sistema privilegia una explicación un poco más amplia pero defendible
antes que una causa atractiva pero frágil.

## D028 — Límites conocidos que siguen abiertos

No son “por decidir” de configuración; son mejoras que todavía requieren evidencia adicional:

1. **Estacionalidad efectiva y fallback jerárquico:** hora/día y herencia entre segmentos.
2. **Mix shift como gate:** suprimir o reclasificar incidentes explicados totalmente por mezcla.
3. **Eventos fuera de orden:** el agregador hoy los rechaza; falta una política de watermark.
4. **Cobertura 3D:** decidir si más historia/volumen justifica ampliar RCA, en vez de aumentar
   dimensiones por ambición.
5. **Calibración por escenarios:** medir systematicamente recall, falsos positivos y tiempo de
   detección para varias seeds, severidades y tasas de tráfico.

Hasta que existan esas pruebas, los valores de D021 son los defaults defendibles del MVP y las
abstenciones son comportamiento esperado, no fallas silenciosas.
