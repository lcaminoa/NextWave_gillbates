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
| Baseline / detección | 🟡 | Beta-Binomial, intervalo creíble, volumen mínimo, EWMA, persistencia, segmentos y calibración con stream continuo. | Estacionalidad efectiva y fallback jerárquico. |
| Mix shift | 🟡 | `mix_shift.py` descompone mezcla vs. performance; hay test. | Usarlo como filtro real antes de abrir un incidente. |
| RCA / evidencia | 🟡 | Pipeline automático, candidatos 1D/2D, score, impacto por hora, distribución de decline codes y controles contrafácticos. | Separación por residuos y ampliar cobertura RCA si se quieren explicar anomalías 3D. |
| Tests | 🟡 | 65 tests: Stream A/B/C, API, caos oculto, simultáneos, recuperación, dedupe, abstención y fallos seguros. | Completar los escenarios P1 que siguen abiertos y la evaluación con OpenAI real. |
| Investigador OpenAI | 🟡 | Runner determinista y runner OpenAI con tools de solo lectura, Structured Outputs, validadores, fallback, Evidence Auditor y worker que no bloquea SSE; tests con mocks. | Elegir el modo de runtime y hacer el primer smoke real auditado. |
| API / stream | ✅ | FastAPI `engine.main`, siete rutas congeladas, SSE compartido, caos seguro, store y deduplicación; tests API y flujo real. | Conectar el modo OpenAI auditado cuando UI defina cómo muestra el audit. |
| Dashboard / Chaos Console | ❌ | Especificación y mocks. | Next.js, `/chaos`, flujo en vivo, detalle de incidente y reveal. |
| Demo / deploy | ❌ | Demo local de Stream B y REPL. | Una demo end-to-end que arranque desde cero y un despliegue estable. |

Leyenda: ✅ implementado y verificado; 🟡 parcial o aislado; ❌ aún no implementado.

## P0 — Entrega mínima competitiva

Estas tareas cierran los puntos explícitos del Challenge 2. No sumar ambición antes de que estén
completas.

### 1. Convertir Stream B en un pipeline de incidente

- [x] Conectar `DetectionEngine` al mix-shift (`engine/detection/pipeline.py`).
  - Completa `Anomaly.mix_shift_effect_pp` y `performance_effect_pp` automaticamente para anomalias de 1 dimension (ver DECISIONS.md D011 para el caso de 2+ dimensiones / global, que no aplica).
  - Pendiente: usarlo como filtro para NO abrir incidente si el mix-shift explica la caida (hoy solo se informa, no se usa como gate).
- [x] Orquestador creado en `engine/detection/pipeline.py` (`DetectionPipeline`), no en `engine/rootcause/` -- envuelve `DetectionEngine` y llama a `generate_candidates()` sin tocarlo. `Anomaly + history + ventana -> IncidentCandidate[] + Evidence[]`, expuesto como `WindowResult`/`AnomalyDiagnosis` por ventana.
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

- [ ] Inicializar `apps/web/` con Next.js, TypeScript y conexión SSE.
- [ ] Control Tower: tasa actual, banda esperada, volumen, fuga e incidentes activos.
- [ ] Incident Detail: causa, baseline vs. observado, evidencia, controles sanos y acción.
- [ ] Timeline: mostrar `InvestigationStep[]` en tiempo real.
- [ ] `/chaos`: controles de inyección, botón `random_unknown` y reveal al final.
- [ ] Mostrar explícitamente `inconclusive` en vez de forzar una causa.

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
- [x] Dos incidentes simultáneos: separar, rankear y no mezclar evidencia.
- [x] Incidente que termina: recuperación sin incidente duplicado.
- [x] Evidencia insuficiente: estado `inconclusive` con explicación de qué falta.
- [ ] Incidente inyectado al azar: coincidencia contra la verdad revelada.

## P2 — Pre-flight de hackathon

Esta sección traduce la checklist compartida por el equipo en trabajo verificable.

- [ ] **Repositorio público + README reproducible.** El README existe, pero debe describir el
  estado real, prerequisitos, `uv sync`, `pnpm install`, comandos de demo y flujo completo.
- [ ] **Demo end-to-end desde cero.** Un único comando o runbook inicia backend, stream, frontend
  y datos bootstrap sin tocar el teclado durante el incidente.
- [ ] **Diagrama de arquitectura en PDF/PNG.** Existe `docs/ARCHITECTURE.md`; falta el artefacto
  visual exportable para repo/deck.
- [x] **Decision log con al menos tres trade-offs.** `DECISIONS.md` contiene D001–D007.
- [ ] **Casos feos manejados explícitamente.** Ruido y bajo volumen están cubiertos; faltan
  incertidumbre, recuperación, mix-shift integrado y doble incidente.
- [ ] **Trial by fire ensayado.** El REPL es una buena prueba local; falta Chaos Console/API
  conectada al producto final y una corrida con una combinación no ensayada.
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

## Orden recomendado de trabajo inmediato

1. Integrar mix shift + orquestador RCA y probarlos contra los casos P1.
2. Construir simulador continuo + Chaos API para que el trial sea real.
3. Exponer SSE/incidentes y conectar la UI contra datos reales.
4. Integrar investigador OpenAI y validación de evidencia.
5. Terminar doble incidente e `inconclusive`.
6. Ensayar el flujo completo, preparar diagrama, README final, slides y pitch.

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
