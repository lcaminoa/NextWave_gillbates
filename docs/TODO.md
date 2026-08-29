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
| Agregación | ✅ | `WindowAggregator` agrupa transacciones por ventanas y segmentos. | Integrarlo al servicio/API real. |
| Baseline / detección | 🟡 | Beta-Binomial, intervalo creíble, volumen mínimo, EWMA, persistencia y segmentos `provider × country`; defaults calibrados contra stream continuo. | Estacionalidad efectiva y fallback jerárquico. |
| Mix shift | 🟡 | El pipeline calcula `mix_shift_effect_pp` y `performance_effect_pp` para anomalías de una dimensión. | Usarlo como filtro real antes de abrir un incidente; hoy informa, pero no bloquea alertas. |
| RCA / evidencia | 🟡 | Pipeline automático, candidatos 1D/2D, score, impacto por hora, distribución de decline codes y contrafácticos; D011 separa candidatos/evidencia por anomalía concurrente. | Priorización global entre incidentes y casos de cobertura residual más complejos. |
| Tests | 🟡 | 18 tests: detección, pipeline y simulador; incluyen stream largo, recuperación y dos incidentes sin mezclar evidencia. | Casos restantes del brief, integración HTTP/SSE y suite repetible de evaluación. |
| Investigador OpenAI | ❌ | Contratos preparados. | Tools de solo lectura, `InvestigationStep[]`, Structured Outputs e `IncidentReport`. |
| API / stream | ❌ | Rutas congeladas en contratos. | FastAPI `engine.main`, SSE y endpoints de incidentes/chaos. |
| Dashboard / Chaos Console | ❌ | Especificación y mocks. | Next.js, `/chaos`, flujo en vivo, detalle de incidente y reveal. |
| Demo / deploy | ❌ | Demo local de Stream B y REPL. | Una demo end-to-end que arranque desde cero y un despliegue estable. |

Leyenda: ✅ implementado y verificado; 🟡 parcial o aislado; ❌ aún no implementado.

## P0 — Entrega mínima competitiva

Estas tareas cierran los puntos explícitos del Challenge 2. No sumar ambición antes de que estén
completas.

### 1. Convertir Stream B en un pipeline de incidente

- [x] Conectar `DetectionEngine` al mix-shift (`engine/detection/pipeline.py`).
  - Completa `Anomaly.mix_shift_effect_pp` y `performance_effect_pp` automaticamente para anomalias de 1 dimension (ver DECISIONS.md D008 para el caso de 2+ dimensiones / global, que no aplica).
  - Pendiente: usarlo como filtro para NO abrir incidente si el mix-shift explica la caida (hoy solo se informa, no se usa como gate).
- [x] Orquestador creado en `engine/detection/pipeline.py` (`DetectionPipeline`), no en `engine/rootcause/` -- envuelve `DetectionEngine` y llama a `generate_candidates()` sin tocarlo. `Anomaly + history + ventana -> IncidentCandidate[] + Evidence[]`, expuesto como `WindowResult`/`AnomalyDiagnosis` por ventana. D011 filtra candidatos y evidencia para que cada anomalía concurrente reciba solo los propios.
- [x] `candidates.py` agrega `Evidence(source="decline_code_distribution", ...)` por candidato (que % de los rechazos son del codigo dominante), ademas del campo `dominant_decline_code`.
- [ ] Definir el criterio determinista para `confirmed`, `probable` e `inconclusive`.
- [x] Calibracion verificada contra un stream continuo real (no la demo sintetica de 2 ventanas): con los defaults de `config.py` sin tocar, un incidente de -35pp se confirma en la ventana 3 de 4. Ver DECISIONS.md D006 (resuelto) y D008.
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
  - Parcial verificado: se separan y no mezclan candidatos/evidencia (`TwoSimultaneousIncidentsTests`).
    Falta una priorización global de incidentes en API/UI.
- [x] Incidente que termina: recuperación sin incidente duplicado.
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
- [x] **Decision log con al menos tres trade-offs.** `DECISIONS.md` contiene D001–D011.
- [ ] **Casos feos manejados explícitamente.** Ruido y bajo volumen están cubiertos; faltan
  incertidumbre, mix-shift usado como gate e `inconclusive`. Recuperación y doble incidente ya
  están cubiertos por tests de pipeline.
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

## Mientras esperamos la API de Valen

No duplicar endpoints ni crear otra consola de caos. Trabajo paralelo útil:

- [ ] Confirmar dueño y branch del Investigador OpenAI; si nadie lo toma, empezar su versión
  API-free contra `AnomalyDiagnosis` (tools de solo lectura + Structured Outputs).
- [ ] Crear el diagrama de arquitectura exportable (PNG/PDF) para la checklist y el deck.
- [ ] Dejar un runbook de demo: stream sano, inyección, espera de persistencia, RCA, reveal y
  recuperación. Se completa cuando exista SSE, pero la narrativa se puede ensayar ya.

## Orden recomendado de trabajo inmediato

1. Valen conecta `PaymentSimulator` + `DetectionPipeline` a FastAPI, SSE y los endpoints de
   chaos; primer smoke test HTTP de punta a punta.
2. Integrar el Investigador OpenAI y validar que cada claim cite `evidence_ids` reales.
3. Franco conecta dashboard y Chaos Console a SSE/API, sin lógica estadística en frontend.
4. Completar mix-shift como gate, status `confirmed`/`probable`/`inconclusive` y priorización
   global de incidentes.
5. Ensayar el flujo completo; terminar README, diagrama, slides, deploy y trial by fire.

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
