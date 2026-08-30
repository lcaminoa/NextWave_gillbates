# TODO de entrega — Control Tower

Estado actualizado a partir de la consigna oficial del **Challenge 2 · The Control Tower**,
el código presente en `main` y la checklist de pre-flight del equipo. Este documento es una
lista de ejecución: marcar una casilla solamente cuando el comportamiento se pueda demostrar,
no cuando exista una idea o un mock aislado.

## Norte de producto

```text
Incidente desconocido inyectado en vivo
→ stream de pagos
→ detector estadístico
→ RCA con evidencia
→ investigación OpenAI visible
→ recomendación humana
→ juez revela la verdad y compara el resultado
```

La consigna no pide remediar pagos automáticamente. El sistema recomienda una acción humana,
pero nunca redirige tráfico ni escribe en sistemas externos.

## Estado actual, sin maquillaje

| Área | Estado | Qué existe hoy | Qué falta para considerarlo terminado |
|---|---|---|---|
| Contratos compartidos | ✅ | Ocho entidades en `contracts/types.ts` y `contracts/schemas.py`; endpoints definidos. | Fixtures compartidos y validación cruzada TS/Python. |
| Datos sintéticos | ✅ | `simulator/` (Stream A, mergeado a main) genera transacciones y aplica `ChaosSpec` manual y `random_unknown` con reveal. Probado en integracion directa con `DetectionPipeline`, incluida la recuperacion al vencer el chaos. | -- |
| Agregación | ✅ | `WindowAggregator` agrupa transacciones por ventanas y segmentos; está conectado a `DetectionPipeline` y al runtime API. | -- |
| Baseline / detección | 🟡 | Beta-Binomial, intervalo creíble, volumen mínimo, EWMA, persistencia y segmentos `provider × country`; defaults calibrados contra stream continuo. | Estacionalidad efectiva y fallback jerárquico. |
| Mix shift | 🟡 | El pipeline calcula `mix_shift_effect_pp` y `performance_effect_pp` para anomalías de una dimensión. | Usarlo como filtro real antes de abrir un incidente; hoy informa, pero no bloquea alertas. |
| RCA / evidencia | 🟡 | Pipeline automático, candidatos 1D/2D, score, impacto por hora, distribución de decline codes y contrafácticos; D011 separa candidatos/evidencia por anomalía concurrente. | Priorización global en UI y casos de cobertura residual más complejos. |
| Tests | 🟡 | 90 tests: Stream A/B/C, API, caos oculto, dedupe, abstención, fallos seguros y auditoría OpenAI mockeada. | Agregar una suite frontend real (`apps/web` aún no define `pnpm test`), completar P1 y evaluar OpenAI auditado con key real. |
| Investigador OpenAI | 🟡 | Modo `deterministic` por defecto y modo `audited_openai` con tools de solo lectura, Structured Outputs, validadores, Evidence Auditor, fallo cerrado y reintento seguro. | Configurar key/modelo solo en el entorno del engine y hacer el primer smoke auditado real. |
| API / stream | ✅ | FastAPI `engine.main`, siete rutas congeladas, SSE compartido, caos seguro, store, deduplicación y CORS con allowlist explícita. | -- |
| Dashboard / Chaos Console | 🟡 | PHAROS en Next.js: landing, Control Room, cola, detalle, SSE, estados `unavailable` y Chaos aleatorio/reveal contra el runtime real. | Corregir Chaos manual: la UI envía `canonical_decline_code`, dimensión que el simulador no puede matchear; además restringir combinaciones de dimensiones incompatibles. La API aún no expone `Anomaly`/`BaselinePoint`; no se debe inventar ese gráfico hasta que exista el contrato. |
| Demo / deploy | 🟡 | Smoke local completo desde UI: `random_unknown` → reveal → reporte → evidencia y pasos reales. | Runbook de un comando y despliegue estable. |

Leyenda: ✅ implementado y verificado; 🟡 parcial o aislado; ❌ aún no implementado.

## P0 — Entrega mínima competitiva

Estas tareas cierran los puntos explícitos del Challenge 2. No sumar ambición antes de que estén
completas.

### 1. Convertir Stream B en un pipeline de incidente

- [x] Conectar `DetectionEngine` al mix-shift (`engine/detection/pipeline.py`).
  - Completa `Anomaly.mix_shift_effect_pp` y `performance_effect_pp` automaticamente para anomalias de 1 dimension (ver DECISIONS.md D011 para el caso de 2+ dimensiones / global, que no aplica).
  - Pendiente: usarlo como filtro para NO abrir incidente si el mix-shift explica la caida (hoy solo se informa, no se usa como gate).
- [x] Orquestador creado en `engine/detection/pipeline.py` (`DetectionPipeline`), no en `engine/rootcause/` -- envuelve `DetectionEngine` y llama a `generate_candidates()` sin tocarlo. `Anomaly + history + ventana -> IncidentCandidate[] + Evidence[]`, expuesto como `WindowResult`/`AnomalyDiagnosis` por ventana. D011 filtra candidatos y evidencia para que cada anomalía concurrente reciba solo los propios.
- [x] `candidates.py` agrega `Evidence(source="decline_code_distribution", ...)` por candidato (que % de los rechazos son del codigo dominante), ademas del campo `dominant_decline_code`.
- [x] Definir el criterio determinista para `confirmed`, `probable` e `inconclusive`.
- [x] Calibracion verificada contra un stream continuo real (no la demo sintetica de 2 ventanas): con los defaults de `config.py` sin tocar, un incidente de -35pp se confirma en la ventana 3 de 4. Ver DECISIONS.md D009 (resuelto) y D011.
- [x] `tests/detection/test_pipeline.py`: pipeline completo detector -> mix-shift -> RCA -> evidencia, mas 2 incidentes simultaneos sin mezclarse.

**Criterio de aceptación:** un caos manual `provider × country` se detecta y genera el candidato
correcto con evidencia; un mix shift puro no crea incidente.

### 2. Construir el simulador y la prueba a ciegas

- [x] Crear `simulator/` como productor continuo de `Transaction` (`PaymentSimulator`).
- [x] Mantener historia bootstrap + stream vivo con estacionalidad, ruido y volúmenes realistas.
- [x] Implementar `ChaosSpec` manual: dimensiones, severidad, inicio y duración.
- [x] Implementar `random_unknown`: selecciona dimensiones al azar (1-3 dims) y las oculta hasta `reveal()`.
- [x] Implementar reveal de la verdad inyectada al finalizar.
- [x] Verificado que un incidente termina al vencer `duration_minutes` y que el detector se
  recupera solo (`tests/detection/test_pipeline.py::ChaosRecoveryTests`, con el simulador real
  de Pancho conectado al pipeline de deteccion: se confirma en la ventana 3, y ya no aparece en
  las ventanas 5-6 tras vencer el chaos).

**Criterio de aceptación:** un juez puede cambiar una combinación no ensayada sin editar código;
el pipeline solo recibe las transacciones, nunca el `ChaosSpec` oculto.

### 3. Exponer el backend mínimo

- [x] Crear `engine/main.py` con `GET /api/health`.
- [x] Implementar `GET /api/stream` por SSE.
- [x] Implementar `GET /api/incidents` y `GET /api/incidents/:id` usando los contratos actuales.
- [x] Implementar `POST /api/chaos/inject`, `/random` y `/reveal`.
- [x] Mantener el estado de un incidente para no crear un reporte duplicado por cada ventana.

**Criterio de aceptación:** desde cero, un cliente recibe pagos por SSE, inyecta caos y consulta
el incidente sin tocar el proceso Python manualmente.

### 4. Implementar el investigador OpenAI

- [x] Crear `engine/investigator/`.
- [x] Exponer 4–6 tools **solo de lectura**: baseline, ranking dimensional, controles,
  decline mix, impacto y candidatos.
- [x] Generar pasos públicos `InvestigationStep[]`; no exponer chain-of-thought.
- [x] Generar `IncidentReport` con Structured Outputs.
- [x] Validar que cada `Claim` tenga `evidence_ids` existentes.
- [x] Incluir resumen, costo, estado de confianza y acción humana recomendada.
- [x] No permitir tools de escritura ni remediación automática.

**Criterio de aceptación:** ante candidatos y evidencia reales, el agente produce una explicación
legible que no inventa métricas ni referencias.

### 5. Construir las tres pantallas de demo

- [x] Inicializar `apps/web/` con Next.js, TypeScript y conexión SSE.
- [x] Control Tower: stream observado, investigaciones reales, contador live y estado explícito si el runtime no está disponible.
  - La banda esperada no se renderiza todavía: la API de incidente no expone `Anomaly` ni `BaselinePoint`, y la UI no fabrica telemetría.
- [x] Incident Detail: candidatos, evidencia citable, controles, timeline real y acción humana recomendada.
- [x] Timeline: mostrar `InvestigationStep[]` registrados por el runtime, sin chain-of-thought.
- [ ] `/chaos`: inyección manual y `random_unknown`, reveal autorizado y comparación que no afirma correlación automática `chaos_id ↔ incident_id`.
  - `random_unknown` y reveal live están verificados. El payload manual actual siempre incluye `canonical_decline_code`, pero el simulador no evalúa esa clave al matchear transacciones: el request se acepta sin degradar tráfico. Corregir serialización/validación de dimensiones antes de marcarlo completo.
- [x] Mostrar explícitamente `inconclusive` en vez de forzar una causa.

**Criterio de aceptación:** una persona que no conoce el código entiende en diez segundos qué
pasó, dónde y por qué el sistema lo cree.

## P1 — Casos obligatorios de evaluación

Implementar como tests automatizados o escenarios reproducibles antes del code freeze.

- [x] Tráfico normal: no alerta por ruido.
- [x] Bajo volumen: no alerta.
- [x] Caída sostenida: alerta después de persistencia.
- [x] Mix shift puro: la fórmula identifica efecto de performance cero.
- [x] `provider × country`: detectado como segmento explícito.
- [ ] Caída global de provider.
- [ ] `provider × issuing_bank`.
- [ ] Regresión de un merchant.
- [ ] Caída de issuing bank a través de proveedores.
- [x] Surge de decline code como evidencia visible.
- [ ] Mix shift + degradación real: reportar ambos efectos.
- [ ] Dos incidentes simultáneos: separar, rankear y no mezclar evidencia.
  - Parcial verificado de punta a punta: API separa los episodios y Stream B no mezcla
    candidatos/evidencia. Falta definir y mostrar una priorización global en UI.
- [x] Incidente que termina: recuperación sin incidente duplicado.
- [x] Evidencia insuficiente: estado `inconclusive` con explicación de qué falta.
- [ ] Incidente inyectado al azar: score automático contra la verdad revelada.
  - El reveal y la comparación manual ya funcionan; el contrato actual no expone relación `chaos_id ↔ incident_id`, por lo que no se puede afirmar un match automático todavía.

## P2 — Pre-flight de hackathon

Esta sección traduce la checklist compartida por el equipo en trabajo verificable.

- [ ] **Repositorio público + README reproducible.** El README existe, pero debe describir el
  estado real, prerequisitos, `uv sync`, `pnpm install`, comandos de demo y flujo completo.
- [ ] **Demo end-to-end desde cero.** Un único comando o runbook inicia backend, stream, frontend
  y datos bootstrap sin tocar el teclado durante el incidente.
- [ ] **Diagrama de arquitectura en PDF/PNG.** Existe `docs/ARCHITECTURE.md`; falta el artefacto
  visual exportable para repo/deck.
- [x] **Decision log con al menos tres trade-offs.** `DECISIONS.md` contiene D001–D029.
- [ ] **Casos feos manejados explícitamente.** Ruido, bajo volumen, incertidumbre,
  `inconclusive`, recuperación y doble incidente están cubiertos; falta usar mix-shift como gate.
- [ ] **Trial by fire ensayado.** La Chaos Console ya pasó un smoke a ciegas desde la UI con
  `random_unknown`, reveal, reporte y detalle live. Falta activar el modo OpenAI auditado con
  credenciales de entorno y repetir la corrida.
- [ ] **Slides públicas + pitch cronometrado.** Crear deck, probar link sin login y ensayar.

## P3 — Ambiciones, solo después del núcleo

- [ ] **Memoria de incidentes.** Guardar huella estructurada, encontrar incidentes similares y
  aclarar visualmente que la memoria aporta contexto, no prueba.
- [ ] **Programmatic Tool Calling.** Usarlo solo para el fan-out acotado de consultas de evidencia
  (comparar, rankear y reducir resultados); el juicio investigativo y la validación final siguen
  con tool calling directo.
- [ ] **Modo ejecutivo y operaciones.** Un resumen de una línea con dinero en riesgo y una vista
  operacional con evidencia completa.
- [ ] **Reloj de fuga de ingresos.** Contador visible de pérdida mientras el incidente sigue vivo.
- [ ] **Árbol de investigación / hipótesis descartadas.** Mostrar qué dimensiones se revisaron y
  qué controles sanos descartaron alternativas.
- [ ] **Puntaje automático de reveal.** Comparar dimensiones inyectadas vs. detectadas, latencia y
  error del costo estimado.
- [ ] **Chaos en lenguaje natural.** Transformar la instrucción del juez en `ChaosSpec` validado;
  mantener los controles estructurados como fallback.
- [x] **Auditor de evidencia.** Segunda validación que rechace claims sin IDs válidos o con una
  confianza que exceda la evidencia.
- [ ] **Suite de evaluación de 100 escenarios.** Métricas reales de detección, FPR, exactitud RCA,
  abstención y latencia; mostrar solo valores medidos.

## Trabajo paralelo después del primer flujo API

No duplicar endpoints ni crear otra consola de caos. Trabajo paralelo útil:

- [x] Publicar el primer flujo FastAPI contra simulador, pipeline e investigador determinista.
- [x] Implementar el Investigator OpenAI y el Evidence Auditor con tests mockeados.
- [x] Conectar dashboard y Chaos Console a los siete endpoints congelados.
- [ ] Crear el diagrama de arquitectura exportable (PNG/PDF) para la checklist y el deck.
- [ ] Dejar un runbook de demo: stream sano, inyección, espera de persistencia, RCA, reveal y
  recuperación usando SSE y los endpoints reales.

## Orden recomendado de trabajo inmediato

1. Corregir Chaos manual y restringir dimensiones incompatibles para que cada escenario aceptado afecte realmente el stream.
2. Configurar el entorno del engine para `audited_openai` y definir cómo mostrar el resultado del audit en UI.
3. Completar mix-shift como gate y la priorización global de incidentes.
4. Ejecutar un smoke real auditado y repetir el trial a ciegas desde la UI.
5. Agregar una suite frontend real para que `pnpm test` sea una validación útil; terminar README, runbook, diagrama exportable, slides, deploy y ensayo del pitch.

## Regla para cortar alcance

Si el tiempo aprieta, preservar esto:

```text
INCIDENTE DESCONOCIDO
→ DETECTADO
→ INVESTIGADO AUTÓNOMAMENTE
→ EVIDENCIA VISIBLE
→ CAUSA RAÍZ CORRECTA
```

No reemplazar ese recorrido por más gráficos, más agentes o infraestructura adicional.
