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
| Datos sintéticos | 🟡 | `simulator/` genera `Transaction` reproducibles, stream infinito, caos manual/aleatorio, reveal y varios incidentes activos; el mock de detección sigue sirviendo para Stream B aislado. | Conectarlo al servicio/API y probar el recorrido completo con el detector. |
| Agregación | ✅ | `WindowAggregator` agrupa transacciones por ventanas y segmentos. | Integrarlo al servicio/API real. |
| Baseline / detección | 🟡 | Beta-Binomial, intervalo creíble, volumen mínimo, EWMA, persistencia y segmentos `provider × country`. | Estacionalidad efectiva, fallback jerárquico y calibración con stream continuo. |
| Mix shift | 🟡 | `mix_shift.py` descompone mezcla vs. performance; hay test. | Usarlo como filtro real antes de abrir un incidente. |
| RCA / evidencia | 🟡 | Candidatos 1D/2D, score, impacto por hora, decline code dominante y controles contrafácticos. | Orquestación automática desde `Anomaly`, distribución de decline codes y separación de residuos. |
| Tests | 🟡 | 15 tests: detección + simulador; cubren transacciones válidas, caos oculto/reveal, duración y dos caos activos. | Casos del brief, tests de integración y suite repetible de evaluación. |
| Investigador OpenAI | ❌ | Contratos preparados. | Tools de solo lectura, `InvestigationStep[]`, Structured Outputs e `IncidentReport`. |
| API / stream | ❌ | Rutas congeladas en contratos. | FastAPI `engine.main`, SSE y endpoints de incidentes/chaos. |
| Dashboard / Chaos Console | ❌ | Especificación y mocks. | Next.js, `/chaos`, flujo en vivo, detalle de incidente y reveal. |
| Demo / deploy | ❌ | Demo local de Stream B y REPL. | Una demo end-to-end que arranque desde cero y un despliegue estable. |

Leyenda: ✅ implementado y verificado; 🟡 parcial o aislado; ❌ aún no implementado.

## P0 — Entrega mínima competitiva

Estas tareas cierran los puntos explícitos del Challenge 2. No sumar ambición antes de que estén
completas.

### 1. Convertir Stream B en un pipeline de incidente

- [ ] Conectar `DetectionEngine` al `MixShiftChecker`.
  - Si la caída es solo composición, no abrir incidente.
  - Completar `Anomaly.mix_shift_effect_pp` y `performance_effect_pp`.
- [ ] Crear un orquestador en `engine/rootcause/`:
  `Anomaly + WindowBatch + history → IncidentCandidate[] + Evidence[]`.
- [ ] Emitir distribución de decline codes como `Evidence`, no solo el código dominante.
- [ ] Definir el criterio determinista para `confirmed`, `probable` e `inconclusive`.
- [ ] Calibrar `ewma_lambda=0.3`, umbral y volumen mínimo usando un stream continuo de varios
  minutos; guardar los resultados.
- [ ] Agregar tests de integración: detector → mix shift → RCA → evidencia.

**Criterio de aceptación:** un caos manual `provider × country` se detecta y genera el candidato
correcto con evidencia; un mix shift puro no crea incidente.

### 2. Conectar el simulador y completar la prueba a ciegas

- [x] Crear `simulator/` como productor de `Transaction`, con lote y stream infinito.
- [x] Incluir ruido y variación de hora/día; permitir semillas reproducibles para tests.
- [x] Implementar `ChaosSpec` manual: dimensiones, severidad, inicio y duración.
- [x] Implementar `random_unknown`: selecciona un segmento detectable y oculta sus dimensiones.
- [x] Implementar reveal de la verdad inyectada; `public_spec()` no filtra dimensiones antes de ese paso.
- [x] Soportar varios ChaosSpec activos, base para dos incidentes simultáneos.
- [ ] Conectar el stream a API + `DetectionEngine`, con historia bootstrap y ritmo realista.
- [ ] Verificar que un incidente termina al vencer `duration_minutes` y que el detector se recupera,
  sin crear un reporte duplicado.

**Criterio de aceptación:** un juez puede cambiar una combinación no ensayada sin editar código;
el pipeline solo recibe las transacciones, nunca el `ChaosSpec` oculto.

### 3. Exponer el backend mínimo

- [ ] Crear `engine/main.py` con `GET /api/health`.
- [ ] Implementar `GET /api/stream` por SSE.
- [ ] Implementar `GET /api/incidents` y `GET /api/incidents/:id` usando los contratos actuales.
- [ ] Implementar `POST /api/chaos/inject`, `/random` y `/reveal`.
- [ ] Mantener el estado de un incidente para no crear un reporte duplicado por cada ventana.

**Criterio de aceptación:** desde cero, un cliente recibe pagos por SSE, inyecta caos y consulta
el incidente sin tocar el proceso Python manualmente.

### 4. Implementar el investigador OpenAI

- [ ] Crear `engine/investigator/`.
- [ ] Exponer 4–6 tools **solo de lectura**: baseline, ranking dimensional, controles,
  decline mix, impacto y candidatos.
- [ ] Generar pasos públicos `InvestigationStep[]`; no exponer chain-of-thought.
- [ ] Generar `IncidentReport` con Structured Outputs.
- [ ] Validar que cada `Claim` tenga `evidence_ids` existentes.
- [ ] Incluir resumen, costo, estado de confianza y acción humana recomendada.
- [ ] No permitir tools de escritura ni remediación automática.

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
- [ ] Surge de decline code como evidencia visible.
- [ ] Mix shift + degradación real: reportar ambos efectos.
- [ ] Dos incidentes simultáneos: separar, rankear y no mezclar evidencia.
- [ ] Incidente que termina: recuperación sin incidente duplicado.
- [ ] Evidencia insuficiente: estado `inconclusive` con explicación de qué falta.
- [ ] Incidente inyectado al azar: coincidencia contra la verdad revelada.

## P2 — Pre-flight de hackathon

Esta sección traduce la checklist compartida por el equipo en trabajo verificable.

- [ ] **Repositorio público + README reproducible.** El README existe, pero debe describir el
  estado real, prerequisitos, `uv sync`, `pnpm install`, comandos de demo y flujo completo.
- [ ] **Demo end-to-end desde cero.** Un único comando o runbook inicia backend, stream, frontend
  y datos bootstrap sin tocar el teclado durante el incidente.
- [ ] **Diagrama de arquitectura en PDF/PNG.** Existe `docs/ARCHITECTURE.md`; falta el artefacto
  visual exportable para repo/deck.
- [x] **Decision log con al menos tres trade-offs.** `DECISIONS.md` contiene D001–D009.
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
- [ ] **Auditor de evidencia.** Segunda validación que rechace claims sin IDs válidos o con una
  confianza que exceda la evidencia.
- [ ] **Suite de evaluación de 100 escenarios.** Métricas reales de detección, FPR, exactitud RCA,
  abstención y latencia; mostrar solo valores medidos.

## Orden recomendado de trabajo inmediato

1. Integrar mix shift + orquestador RCA y probarlos contra los casos P1.
2. Conectar el simulador existente a Chaos API, SSE y `DetectionEngine` para que el trial sea real.
3. Conectar la UI contra esos datos reales.
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
