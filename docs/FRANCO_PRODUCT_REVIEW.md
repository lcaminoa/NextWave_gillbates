# Revisión de producto y plan de uso de OpenAI API

**Autor:** Franco  
**Estado:** propuesta para conversar entre los cuatro antes de convertirla en decisiones del `DECISIONS.md`.  
**Fecha:** 2026-08-29

---

## La idea, en una frase

**Control Tower es un investigador autónomo de incidentes de pagos:** observa conversiones en vivo, separa una caída real del ruido, aísla la combinación de dimensiones que mejor explica la pérdida y entrega una recomendación humana respaldada por evidencia.

No es un dashboard que alerta ni un chatbot que resume gráficos. El flujo que debe quedar demostrado es:

```text
Transacciones en vivo
        ↓
Baseline estadístico por segmento
        ↓
Anomalía confirmada
        ↓
Hipótesis de causa + controles entre proveedores
        ↓
Evidencia, impacto económico y explicación
        ↓
Recomendación humana (nunca remediación automática)
```

La prueba más importante es el **Chaos Console**: un juez inyecta una combinación no ensayada, el sistema la detecta, la separa de otros incidentes y luego compara su diagnóstico con la verdad revelada.

## Qué ya está muy bien decidido

1. **No competir con un monitor básico.** Yuno ya comunica detección de anomalías, alertas y respuesta automatizada; Primer e IXOPAY también ofrecen monitoreo dinámico contra un rango esperado. Nuestro diferencial tiene que ser la investigación autónoma y auditable, no otro gráfico de approval rate.
2. **Usar controles multiproveedor.** La evidencia visual más fuerte es: “mismo emisor, país y método; otro proveedor sano”. Yuno identifica precisamente los emparejamientos emisor–adquirente como un problema que un PSP único no puede diagnosticar.
3. **Baseline Beta-Binomial + detección secuencial.** Es explicable, apropiado para una tasa de aprobaciones y maneja mejor el bajo volumen que un umbral fijo o un `Isolation Forest`.
4. **Separar `Anomaly` de `IncidentCandidate`.** Permite que dos hipótesis compitan y que `inconclusive` sea una respuesta válida.
5. **Evidencia obligatoria por afirmación.** El LLM no puede inventar una causa: cada claim del reporte lleva `evidence_ids`.
6. **Un agente, no un swarm.** El desafío pide un agente que haga trabajo autónomo; no pide un enjambre de agentes. Un Investigador con tools de solo lectura es más demostrable y robusto.

Fuentes de posicionamiento: [Yuno Monitors](https://www.y.uno/es/product/monitors), [Yuno sobre issuer–acquirer pairing](https://www.y.uno/en/blog/issuer-acquirer-pairing-mismatches-the-root-cause-of-authorization-failures-that-no-single-provi), [Primer Monitors](https://primer.io/manage/monitors), [IXOPAY Anomaly Detection](https://documentation.ixopay.com/modules/docs/payments-intelligence/observability/anomaly-detection).

## Ajuste de enfoque recomendado

No intentemos construir una plataforma universal de observabilidad de pagos. En 24 horas, el producto ganador es un **vertical slice defendible**:

1. historial sintético previo + stream vivo normal;
2. incidente arbitrario inyectado por dimensiones;
3. detector con volumen mínimo, persistencia y baseline;
4. RCA que devuelve candidatos ordenados y evidencia;
5. investigador OpenAI que consulta esa evidencia y produce un reporte estructurado;
6. dos pantallas principales: Control Tower e Incident Detail, más Chaos Console;
7. dos incidentes simultáneos e `inconclusive`.

Dejar para después: vector DB, memoria semántica compleja, inyección por lenguaje natural, grafo causal sofisticado, dashboard de 100 evaluaciones y arquitectura multiagente.

### Estado verificado al 2026-08-29: Stream B ya demuestra el núcleo

El Stream B incorporó generador mock, baseline Beta-Binomial, detección secuencial con volumen mínimo y persistencia, descomposición de mix y RCA de hasta dos dimensiones. La demo local (`uv run python -m engine.detection.demo`) verificó:

- tráfico sano: 0 alertas;
- caos `provider=nova_pay` × `country=BR`, -45 pp: el primer candidato fue la intersección correcta, con 87 % de confianza y evidencia de caída;
- el cambio de mix explicó solo -0,17 pp, frente a -2,77 pp de degradación dentro de segmentos.

La D003 también corrige bien un problema real: una penalización fija por complejidad ocultaba segmentos pequeños pero precisos; el ranking multiplicativo priorizó la intersección correcta. Esto no reemplaza las siguientes integraciones: Stream A debe suministrar el stream/historial definitivo; Stream C debe convertir candidatos y evidencia en investigación visible; Stream D debe hacer legible el resultado.

### Regla técnica clave

El motor determinista decide métricas, candidatos, confianza e impacto. El agente **no calcula estadísticas desde filas crudas** ni elige una causa sin soporte; ejecuta una investigación visible mediante tools, decide qué comparación pedir después y redacta el resultado con evidencia.

Eso conserva el carácter agentic y reduce mucho el riesgo en el trial a ciegas. Es consistente con el enfoque de hipótesis, herramientas y evidencia de [Datadog Bits Investigation](https://docs.datadoghq.com/bits_ai/bits_investigation/investigate_issues/).

## Temas que falta acordar

| Tema | Propuesta | Por qué importa |
|---|---|---|
| Bootstrap del baseline | Generar/cargar historia sintética antes de iniciar el stream de demo. | No se aprende una estacionalidad creíble en los primeros segundos. |
| Estacionalidad efectiva | Filtrar el histórico por bucket comparable de hora y día antes de calcular el baseline. Hoy el baseline Beta-Binomial ya existe, pero ese filtro todavía debe conectarse. | Evita comparar el pico de una tarde con la madrugada o un fin de semana. |
| Transporte en vivo | Elegir **SSE** para `GET /api/stream`; WebSocket solo si luego hace falta bidireccionalidad real. | Menos complejidad para el dashboard. |
| Campos de datos | Evaluar `card_scheme`, `issuer_bin` sintético y `payment_status` (`approved`, `declined`, `pending`, `unknown`). | Refuerza el control emisor–adquirente y evita tratar un timeout como un rechazo definitivo. No cambiar contratos sin acuerdo del equipo. |
| Control contrafáctico | Para una hipótesis de dos dimensiones, comparar contra un control que conserve las demás dimensiones relevantes (por ejemplo, mismo país/método/emisor con otro proveedor). | El control actual de una sola dimensión es una buena base, pero el “gemelo sano” debe respaldar también la intersección que el RCA declara como causa. |
| Ciclo de vida del incidente | Definir `open`, `investigating`, `confirmed`, `inconclusive`, `resolved` y una clave estable de deduplicación. | Tras cumplir persistencia, no queremos crear un reporte nuevo en cada ventana del mismo incidente. |
| Múltiples incidentes | Buscar candidatos por residuo y detenerse si el resto no supera evidencia suficiente; probar dos chaos simultáneos. | Evita forzar un solo “incidente global” o diagnósticos inventados. |
| Escala del `rca_score` | Decidir si es un índice de prioridad sin máximo o normalizarlo a 0–1 para la UI. La demo actual puede dar un valor mayor a 1 por el premio de especificidad. | Evita mostrarlo al jurado como “confianza” por error: confianza y prioridad son conceptos distintos. |
| Evaluación | Definir 8–10 escenarios automáticos antes de integrar UI. | Permite medir detección, exactitud RCA, abstención y separación de incidentes. |
| Contratos espejo | Agregar fixtures JSON compartidos y un test TS/Python que los valide. | `types.ts` y `schemas.py` hoy pueden divergir por edición manual. |

## Uso recomendado de los créditos de OpenAI API

Entre los cuatro hay aproximadamente **USD 200** de crédito API. Hay que usarlo donde suma producto y evidencia, no para llamar al modelo por cada transacción.

### Dónde sí usar API

- Ejecutar el **Investigador** solamente después de que el detector confirma una anomalía.
- Exponerle 4–6 tools de solo lectura, por ejemplo:
  - `rank_dimension_anomalies()`
  - `compare_to_baseline()`
  - `compare_provider_controls()`
  - `get_decline_mix()`
  - `estimate_financial_impact()`
  - `search_incident_memory()` (solo cuando exista memoria)
- Generar `InvestigationStep[]` en vivo y un `IncidentReport` estructurado, con claims enlazados a evidencia.
- Probar el agente contra escenarios de caos antes de la demo y guardar resultados de la evaluación.

La API Responses admite tools con argumentos tipados y salida estructurada; los modelos actuales recomendados admiten function calling y structured outputs. [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini)

### Dónde no usar API

- No enviar cada `Transaction` al LLM.
- No pedirle que calcule conversiones, intervalos de confianza ni pérdidas.
- No usar web search en la experiencia del producto: la causa tiene que provenir del stream y sus controles, no de información externa impredecible.
- No gastar crédito en un segundo o tercer agente que repite el trabajo del primero.

### Configuración sugerida

1. **Primera implementación:** `gpt-5.6-luna` con `reasoning.effort: low` o `medium`, invocado solo para un incidente confirmado. La documentación actual lo recomienda para trabajo eficiente y de alto volumen; usar `medium` como punto de partida equilibrado.
2. **Fallback/evaluaciones de costo bajo:** `gpt-5-mini`. Admite tools y salida estructurada y su precio publicado es USD 0,25 / millón de tokens de entrada y USD 2 / millón de tokens de salida.
3. **No usar modo Pro durante la demo.** Reservarlo, si acaso, para analizar offline un caso difícil: aumenta trabajo del modelo, latencia y uso.
4. **Un key de runtime para la demo.** Elegir una cuenta con saldo confirmado para el backend; los demás créditos pueden usarse en pruebas individuales. Nunca commitear keys: solo `OPENAI_API_KEY` en `.env` local y nombre en `.env.example`.
5. **Presupuesto por cuenta de USD 50:** ~20 % para prototipos de tools/prompt, ~40 % para corridas integradas y escenarios, ~20 % para ensayos de demo y ~20 % de reserva. Medir consumo en el dashboard de Usage/Costs en lugar de asumirlo.

La guía oficial actual recomienda Responses API para workflows con razonamiento y tools; también recomienda evaluar esfuerzo de razonamiento contra escenarios representativos en vez de asumir que el máximo esfuerzo produce el mejor resultado. [Model guidance](https://developers.openai.com/api/docs/guides/latest-model), [Usage and Costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage).

## Rol propuesto para Franco: UI/UX + Product Integration / Demo Owner

El frontend no es “solo UI” en este producto. La mejor contribución adicional es ser dueño de la **integración de producto y de la historia de demo**:

- Diseñar los estados críticos: normal, detecting, investigating, confirmed, inconclusive y dos incidentes simultáneos.
- Construir Control Tower, Incident Detail y Chaos Console contra contratos reales, no mocks indefinidos.
- Definir qué evidencia es comprensible en 10 segundos: baseline vs. real, gemelo contrafáctico sano, impacto y alternativas descartadas.
- Integrar el stream SSE y convertir entidades del backend en componentes claros.
- Definir criterios de aceptación visual/funcional para cada escenario de caos y dirigir los ensayos de demo/pitch.

Eso te convierte en responsable de que el sistema técnico se vuelva una historia que el jurado entienda y recuerde, sin invadir la propiedad de simulación, detección o investigador de los otros streams.
