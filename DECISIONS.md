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

El paquete del Auditor contiene la `Anomaly`, ganador, alternativas propias mas simples y principal
competidora con `confidence`, `rca_score`, impacto, `evidence_ids` y `counterfactual_check`; la
evidencia sigue limitada a IDs efectivamente consultados. Nunca recibe `ChaosSpec`, dimensiones
secretas del random, transacciones crudas, tools ni capacidad de modificar el reporte.

Tradeoff: el umbral de 8 pp privilegia evitar una explicacion vistosa pero falsa y puede volver
`inconclusive` un incidente real con poco volumen. Para la prueba a ciegas es preferible
sub-atribuir; el valor queda centralizado y puede recalibrarse con escenarios reproducibles sin
cambiar contratos.
