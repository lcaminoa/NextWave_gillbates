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

## D006 — Chaos Console separa configuración, ejecución ciega y comparación verificable

Alternativas:
1. mostrar siempre el escenario completo para simplificar la demo
2. construir un panel tipo terminal con logs técnicos y un resultado de match único
3. modelar tres fases explícitas: configuración, ejecución con verdad sellada y comparación por campo

Decisión: 3

Por qué:
- el modo `random_unknown` debe demostrar que el investigador no recibe una respuesta
  hardcodeada; por eso no representa dimensiones ni parcialmente hasta que el backend revele
  el ground truth
- el operador puede revisar y confirmar un escenario manual sin convertir la consola en una
  herramienta de remediación: inyectar no desvía tráfico ni ejecuta cambios externos
- la comparación final conserva los matices de la investigación: cada dimensión, severidad y
  tiempo se califica como match, partial o mismatch, sin ocultar un resultado parcial detrás de
  un indicador global

Tradeoff: el fixture local no puede demostrar un reveal aleatorio real sin conocer dimensiones
ocultas. Por integridad, el flujo queda sellado y señala el adaptador `POST /api/chaos/reveal`
hasta que el backend entregue el ground truth autorizado.

## D007 — Navegación global como header de producto y bandeja de investigaciones

Alternativas:
1. conservar la sidebar solo en Control Tower y usar enlaces de regreso en las demás pantallas
2. agregar una pill aislada que solo conecte Overview y Chaos Lab
3. usar un header compacto compartido con `Overview`, `Investigations` y `Chaos Lab`, y crear
   una bandeja de investigaciones basada en los `IncidentReport` existentes

Decisión: 3

Por qué:
- los tres destinos se entienden como partes de una sola herramienta de investigación, no como
  pantallas sueltas de demo
- un header horizontal preserva el ancho del workspace y el aire de las vistas de evidencia;
  una sidebar permanente sería desproporcionada para tres destinos
- `Investigations` deja de ser un enlace artificial hacia un único detalle: ordena los casos por
  impacto y distingue de forma explícita `probable` de `inconclusive`
- la nueva ruta es solo una composición de frontend sobre fixtures tipadas y no agrega endpoint,
  campo de contrato ni capacidad de remediación

Tradeoff: la bandeja muestra los dos incidentes fixture hasta conectar `GET /api/incidents`.
El badge de navegación también es fixture por ahora y deberá leer la lista real al integrar.

## D008 — Landing pública con señal procedimental y scroll nativo

Alternativas:
1. resolver la landing como una hero estática o un video de fondo
2. importar un modelo 3D externo o un iframe para recrear la referencia
3. construir una única señal de aprobación procedimental en Three.js, cargada solo en cliente,
   y coreografiarla con el scroll nativo de la página

Decisión: 3

Por qué:
- la pieza puede representar el dato de producto (salud, desviación, control y evidencia) sin
  reutilizar el producto, la marca ni los assets de la referencia
- no depende de una GLB, CDN ni video; la señal, sus capas y sus fragmentos se construyen con
  geometría y materiales locales, y la experiencia conserva un fallback DOM cuando WebGL no
  está disponible
- el progreso se amortigua mediante `requestAnimationFrame` sobre scroll nativo, por lo que el
  objeto conserva inercia sin secuestrar la barra de desplazamiento ni interferir con rutas del
  producto
- `three` y React Three Fiber se cargan con `ssr: false` dentro de la landing: el dashboard y
  el resto de la aplicación no pagan ni arriesgan render WebGL en servidor

Tradeoff: agrega peso de JavaScript solo a `/` y una escena de render que debe seguir siendo
sobria. Se limita a una única pieza focal, DPR acotado, sombras moderadas y una composición
estática accesible para `prefers-reduced-motion`.

## D009 — Hero PHAROS como trayectoria de incidente sincronizada

Alternativas:
1. conservar la caída libre de la señal y agregar captions independientes
2. convertir el hero en un gráfico tradicional sin objeto físico
3. sincronizar una trayectoria SVG de seis hitos con el objeto WebGL y las captions de evidencia

Decisión: 3

Por qué:
- los seis hitos hacen legible la investigación completa: baseline, caída sostenida, alcance,
  control de proveedor, patrón de decline y explicación probable
- el SVG provee un rail esperado, una ruta observada, nodos y conectores sin reemplazar la señal
  física como foco de la composición
- DOM, SVG, WebGL y fallback leen el mismo modelo de checkpoints, por lo que la narrativa no
  puede desalinearse entre animación, valores y accesibilidad
- el scroll nativo amortiguado conserva masa visual sin impedir scrub manual ni accesibilidad

Tradeoff: la sección pinned pasa a 740vh para dar tiempo a cada conclusión. La superficie
adicional se compensa con una sola caption visible por vez, trayectoria central y un handoff
final sobrio hacia la evidencia ya existente.
