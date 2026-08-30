# Control Tower — especificación integral de Frontend, UI/UX y demo

**Owner propuesto:** Franco — Stream D: Producto, UI/UX, integración y demo.
**Estado:** guía de construcción. Respeta los contratos vigentes; no modifica la fuente de verdad.
**Fecha:** 2026-08-29

---

## 1. La idea que toda pantalla tiene que transmitir

> **Control Tower no es un dashboard que avisa que algo cayó. Es un investigador autónomo de pagos que demuestra qué se rompió, a quién afecta, cuánto cuesta y qué debería revisar una persona.**

La experiencia tiene que responder, en menos de diez segundos, estas cuatro preguntas:

1. ¿Hay un incidente real o es ruido?
2. ¿Qué combinación de dimensiones lo explica mejor?
3. ¿Qué evidencia respalda o descarta esa causa?
4. ¿Qué acción humana concreta conviene tomar?

El flujo que el usuario debe percibir es:

```text
Stream de pagos sano
        ↓
Anomalía sostenida confirmada estadísticamente
        ↓
Alerta in-app + aviso externo de que la investigación empezó
        ↓
Investigación visible con pasos y evidencia
        ↓
Causa probable / confirmada o "evidencia insuficiente"
        ↓
Recomendación humana; nunca remediación automática
```

No diseñar la UI como un chatbot ni como un centro de métricas genérico. El gráfico prueba el contexto; la **historia de investigación** es el producto.

## 2. Alcance y límites

### Dentro del alcance

- Dashboard de operaciones en vivo.
- Detalle investigable y auditable de un incidente.
- Consola de Chaos para la prueba a ciegas del jurado.
- Notificación in-app obligatoria y notificación externa de demo por email; WhatsApp como bonus real si queda estable.
- Estados de normalidad, investigación, resultado, incertidumbre y múltiples incidentes.
- Modo presentación para la demo.

### Fuera del alcance por ahora

- Doce páginas de administración, usuarios, roles, billing o configuración compleja.
- Autenticación de clientes o portal multi-tenant.
- Remediación automática, botones para rerutear tráfico o cambios reales en PSPs.
- Supabase/Postgres solo para “parecer producción”. Para la hackathon, memoria + SQLite/DuckDB es suficiente salvo que la persistencia sume una capacidad visible.
- Un chat abierto que recibe CSVs o calcula métricas. El frontend muestra cálculos del backend y evidencia citada.

## 3. Fuentes de verdad: datos que la UI puede usar

Leer antes de implementar:

- `AGENTS.md`: ownership, comandos y límites del equipo.
- `contracts/CONTRACTS.md`: endpoints congelados.
- `contracts/types.ts`: tipos TypeScript canónicos.
- `NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md`, secciones 8, 17 y 18: narrativa de demo y UX.

Los endpoints existentes son:

```text
GET  /api/health
GET  /api/stream
GET  /api/incidents
GET  /api/incidents/:id
POST /api/chaos/inject
POST /api/chaos/random
POST /api/chaos/reveal
```

No agregar campos, rutas ni tipos en `contracts/` sin avisar y acordarlo entre los cuatro. Si una pantalla necesita algo que no llega todavía, usar una fixture local que respete el tipo existente y dejar el adaptador listo para la API real.

### Mapa de entidades a UI

| Entidad | Quién la produce | Cómo se usa visualmente |
|---|---|---|
| `Transaction` | Stream A | volumen en vivo, ticker compacto y gráfico de conversión actual; nunca mostrar miles de filas. |
| `BaselinePoint` | Stream B | rango esperado y banda de confianza del gráfico. |
| `Anomaly` | Stream B | evento de detección, severidad, delta, volumen y estado “investigating”. |
| `IncidentCandidate` | Stream B | hipótesis rankeadas, dimensiones, confianza, pérdida/hora y control contrafáctico. |
| `Evidence` | Stream B/C | tarjetas citables que justifican claims; no texto suelto sin evidencia. |
| `InvestigationStep` | Stream C | timeline animado de acciones observables de la IA. |
| `IncidentReport` | Stream C | estado final, resumen, claims, acción recomendada y revisión humana. |
| `ChaosSpec` | Stream D ↔ Stream A | controles de inyección y revelado de la verdad, nunca expuestos antes del reveal en modo aleatorio. |

## 4. Arquitectura de información: tres rutas, no más

```text
/                         Control Tower
│
├── /incidents/[id]       Detalle de una investigación
│
└── /chaos                Chaos Console del jurado / demo operator
```

El modo presentación no necesita una cuarta página: usar `?presentation=1` o un toggle local que oculte navegación secundaria, aumente tipografías y muestre solo los elementos de historia de demo.

Un centro de notificaciones, panel de filtros, explicación del baseline y preferencias pueden ser drawers, popovers o modales. No necesitan rutas propias.

## 5. Flujo completo y estados UX

| Momento | Qué ocurre realmente | Qué ve la persona |
|---|---|---|
| Normal | llegan transacciones; el baseline contiene el ruido | dashboard tranquilo, stream `LIVE`, 0 incidentes y ningún rojo artificial. |
| Señal aún no confirmada | existe una desviación pero no cumple persistencia | el gráfico puede moverse; no hay alerta externa ni pánico visual. |
| Anomalía confirmada | Stream B supera volumen y ventanas de persistencia | alerta in-app prominente; se crea la tarjeta “Investigating”; se dispara el aviso externo. |
| Investigación | Stream C consulta candidatos y evidencia | timeline de `InvestigationStep` progresando con acciones y resultados cortos. |
| Resultado | existe `IncidentReport` | estado `confirmed`, `probable` o `inconclusive`; causa/evidencia/acción humana. |
| Recuperación | el backend determina que terminó; por acordar | estado visual `resolved` sin borrar el incidente ni inventar una nueva causa. |
| Dos incidentes | dos anomalías/candidatos independientes | dos tarjetas priorizadas y dos timelines; nunca fundirlas en una tarjeta global. |

### Distinción importante de estados

`investigating` y `resolved` son **estados de experiencia** derivados del flujo. El contrato actual de `IncidentReport.status` solo usa `confirmed`, `probable` e `inconclusive`. No cambiar ese literal ni presentar `rca_score` como si fuera “confianza”: `confidence` y prioridad son conceptos distintos.

## 6. Control Tower: especificación de la pantalla principal (`/`)

### Objetivo

Que un operador o jurado entienda salud global, riesgo actual y prioridad de incidentes sin leer una tabla ni navegar.

### Estructura desktop, de arriba hacia abajo

1. **Header compacto**
   - marca `CONTROL TOWER`;
   - indicador `LIVE` verde / `RECONNECTING` ámbar / `OFFLINE` rojo, nunca solo color;
   - hora local de la demo y selector de ventana si existe;
   - campana de notificaciones con contador;
   - botón discreto `Presentation mode`.

2. **Barra de estado global**
   - `Approval rate`: valor actual;
   - `Expected range`: intervalo de credibilidad;
   - `Revenue at risk`: USD/minuto o USD/hora, siempre rotulado con la unidad;
   - `Active incidents`: número y máximo nivel de severidad;
   - `Live volume`: tx/min.

   Cada KPI debe incluir una frase corta de interpretación, por ejemplo: “89,1 % · dentro del rango 88,7–90,8 %”. Un valor aislado no comunica si es bueno o malo.

3. **Gráfico principal: approval rate en vivo**
   - línea de aprobación observada;
   - banda semitransparente de rango esperado;
   - marcas verticales para detección e inicio de investigación;
   - tooltip con hora, observado, esperado y volumen;
   - si hay incidente, foco automático pero reversible en la ventana que explica la caída;
   - no exagerar la escala Y hasta hacer parecer crítico un cambio irrelevante.

4. **Columna de incidentes activos**
   - como máximo tres tarjetas prioritarias a la vez;
   - orden: criticidad, impacto, tiempo desde detección;
   - cada tarjeta: severidad, estado, dimensiones conocidas, delta, pérdida estimada, momento y CTA `Open investigation`;
   - los incidentes `inconclusive` no son errores: mostrar “Evidence insufficient” con tono violeta/neutral, no rojo de fallo.

5. **Investigation lane / timeline reciente**
   - feed de `InvestigationStep` y cambios de estado, con hora;
   - animar solo un paso nuevo real recibido del backend;
   - copiar acciones observables: “Comparing providers”, “Brazil isolated”, “Control healthy”; jamás inventar razonamiento interno del modelo.

6. **Ticker de stream (secundario)**
   - 5–8 transacciones recientes con país, proveedor, método, monto y resultado;
   - útil para que la pantalla se sienta viva, pero debe ocupar poco espacio;
   - no convertirlo en una tabla de auditoría infinita.

### Alerta in-app obligatoria

Al confirmarse una anomalía, mostrar simultáneamente:

- toast persistente (no desaparece solo) con severidad, delta e impacto;
- nueva tarjeta de incidente en la columna;
- badge de notificación sin depender del toast;
- sonido breve **solo** si el navegador lo permite y existe una preferencia local; no bloquear la demo por audio;
- CTA claro: `Watch investigation` / `Open incident`.

Ejemplo de copy inicial, sin adelantar una causa que el agente aún no probó:

```text
HIGH · PAYMENT ANOMALY DETECTED
Approval rate is 14.8 pp below its expected range.
1,842 tx/min affected · Investigation started
[ Watch investigation ]
```

## 7. Detalle de incidente (`/incidents/[id]`)

### Objetivo

Transformar una alerta en un diagnóstico defendible. Esta es la pantalla que gana la demo.

### Header / hero

Mostrar, sin scroll:

```text
HIGH · PROBABLE ROOT CAUSE                    Human review required

NovaPay × Brazil × Card × Itaú

Detected at 12:14:02 · 31.4 pp approval drop · USD 11,220/hour at risk
```

El contenido exacto sale de `IncidentReport`, su `winning_candidate_id` y el `IncidentCandidate` asociado. Si no existe candidato ganador por ser `inconclusive`, no fabricar una combinación: usar un hero honesto de “No single cause reached the evidence threshold”.

### Bloques, en este orden

1. **Qué pasó**
   - resumen de `IncidentReport.summary`;
   - observed vs baseline/current decline rate;
   - hora, volumen afectado y fuga económica.

2. **Causa y árbol jerárquico**
   - flujo desde `Global` hacia las dimensiones de la hipótesis (país → proveedor → método → emisor, solo las que existen);
   - mostrar ramas sanas atenuadas únicamente cuando haya control/evidencia que lo justifique;
   - no hacer un “grafo de IA” decorativo y difícil de leer.

3. **Timeline de investigación**
   - lista ordenada de `InvestigationStep` con timestamp, acción, resultado breve y estado;
   - en vivo mientras se investiga, estática pero expandible al terminar;
   - cada paso debe responder “qué consultó” o “qué aisló”.

4. **Evidence board**
   - tarjetas de `Evidence`, agrupadas como `Baseline`, `Provider control`, `Decline-code mix`, `Traffic mix`;
   - cada `Claim` del reporte se presenta junto a sus `evidence_ids` resueltos;
   - el texto `counterfactual_check`, cuando exista, debe tener máximo protagonismo: es el “gemelo sano” que diferencia el producto.

5. **Hipótesis evaluadas**
   - mostrar hasta tres candidatos ordenados: el ganador y alternativas;
   - distinguir “supported” de “not enough evidence”, no “false” salvo que exista evidencia explícita;
   - **pendiente de backend:** no hay un campo formal de hipótesis descartadas con razón. Diseñar el espacio, pero no inventar frases de descarte.

6. **Acción humana recomendada**
   - tarjeta final clara y con borde diferenciado;
   - texto de `recommended_action`;
   - sello visible: `Recommendation only — no traffic was rerouted`;
   - ningún botón `Apply`, `Fix`, `Reroute` o equivalente.

7. **Incidente similar** (solo si llega `matches_past_incident_id`)
   - una tarjeta pequeña, link a incidente anterior;
   - no construir una página de memoria antes de tener este dato.

### Variante: `inconclusive`

Esta variante debe sentirse madura, no incompleta:

```text
EVIDENCE INSUFFICIENT
Two hypotheses explain the drop similarly. No cause is being asserted.

Top candidates: issuer-side degradation / provider-country interaction
Next recommended human check: …
```

Mantener el impacto y los datos observados; reemplazar la “causa raíz” por incertidumbre explícita. Es un punto que el challenge valora.

## 8. Chaos Console (`/chaos`)

### Propósito

Permite al operador/jurado probar que no hay un caso hardcodeado. Debe poder abrirse en una segunda ventana durante la demo.

### Controles

- modo: `Manual` o `Random unknown`;
- dimensiones opcionales: merchant, provider, payment method, country, issuing bank y canonical decline code si el simulador lo admite;
- severidad en puntos porcentuales;
- duración;
- toggle `Add second simultaneous incident` solo si el backend ya lo soporta;
- botón de inyección con confirmación breve;
- estado de ejecución y contador desde inicio.

### Regla de integridad de demo

En `random_unknown`, la UI no recibe ni renderiza dimensiones antes de `POST /api/chaos/reveal`. Debe mostrar algo como:

```text
Blind incident injected
Ground truth remains hidden from the investigator
```

Después del reveal, mostrar una comparación limpia:

| Ground truth | System finding |
|---|---|
| dimensiones inyectadas | dimensiones detectadas |
| severidad inyectada | caída observada |
| hora de inicio | hora de detección |

No declarar “match” automáticamente si solo coincide una parte de las dimensiones; usar una comparación literal por cada dimensión.

## 9. Sistema de notificaciones: parte del producto, no decoración

### Regla de disparo

La notificación se dispara cuando existe una **anomalía confirmada** (volumen + persistencia), no por cada transacción rechazada ni por una señal de una ventana. El primer mensaje dice “investigación iniciada”; la causa se comunica solo en una actualización cuando el `IncidentReport` esté listo.

### Canales y prioridad

| Canal | Rol en el MVP | Cuándo | Qué afirmar con honestidad |
|---|---|---|---|
| In-app | obligatorio | toda anomalía confirmada | estado real de investigación. |
| Email con Resend | recomendación fuerte | `high` / `critical`; opcional `medium` | “email send accepted” si la API respondió; “delivered” solo con evento de entrega real. |
| WhatsApp con Twilio Sandbox | bonus de demo | primer incidente `high`/`critical` | mostrarlo en un teléfono solo si el sandbox fue validado antes. |
| Browser notification | opcional | si el navegador tiene permiso | nunca depender de ella para la demo. |

### Secuencia de mensajes

1. **Detección:** “Approval drop confirmed; investigation started”.
2. **Resultado:** “Probable cause found” o “Investigation remains inconclusive”.
3. **Resolución:** solo cuando el backend tenga una señal real de recuperación; no inventarla desde el frontend.

Evitar mandar actualizaciones en cada `InvestigationStep`. Una alerta bien priorizada es más creíble que seis mensajes de bot.

### Contenido mínimo del primer email / WhatsApp

```text
Subject: [HIGH] Payment anomaly under investigation — Control Tower

Approval is 14.8 pp below its expected range.
Affected volume: 1,842 tx/min
Estimated revenue at risk: USD 187/min
Status: Investigation started
Open investigation: <demo URL>/incidents/<id>
```

No incluir una causa específica hasta que haya evidencia. No exponer secretos, datos personales ni un enlace que requiera autenticación no configurada.

### Implementación segura y realista

- El envío externo es server-side: nunca exponer `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID` ni tokens en el browser o el repositorio.
- Variables de entorno esperadas, sin valores: `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `ALERT_WHATSAPP_TO`.
- Usar una clave de idempotencia por `incident_id + notification_type` para no duplicar envíos.
- Resend permite enviar email por API y soporta claves de idempotencia. Twilio Sandbox permite probar WhatsApp sin registrar un sender comercial, pero cada dispositivo receptor debe unirse al sandbox antes de la demo. [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [Twilio WhatsApp Sandbox](https://www.twilio.com/docs/whatsapp/sandbox?display=embedded)
- Las rutas públicas están congeladas. El envío debe engancharse internamente donde se crea la anomalía/reporte; no crear un endpoint nuevo sin acuerdo de equipo.
- Mientras no exista callback de proveedor, el centro de notificaciones puede decir `sending` o `send accepted`; no mostrar `delivered` como ficción.

### Punto pendiente para acordar con el equipo

Quién es responsable del pequeño handler server-side de alertas y qué evento interno lo invoca. El frontend puede detectar un incidente nuevo consultando `GET /api/incidents`, pero no debe intentar enviar correo directamente desde el cliente. Este acuerdo no requiere modificar contratos públicos si se mantiene interno al backend.

## 10. Lenguaje visual y sistema de diseño

### Dirección estética

**Operations control room sobrio y premium**, no “cyberpunk terminal”. Fondo oscuro que deja brillar las señales, mucho espacio, bordes suaves y datos legibles. El foco visual se reserva para el incidente y su evidencia.

### Tokens propuestos (punto de partida, no contrato)

| Rol | Propuesta | Uso |
|---|---|---|
| `canvas` | `#090E1A` | fondo global. |
| `surface` | `#111827` | cards y paneles. |
| `surface_raised` | `#172033` | hover, drawer, timeline activa. |
| `text_primary` | `#F4F7FB` | valores y títulos. |
| `text_muted` | `#93A4BD` | contexto y labels. |
| `healthy` | `#2DD4A7` | normalidad / live. |
| `warning` | `#FBBF24` | medium, reconexión. |
| `critical` | `#FB7185` | high/critical y caída real. |
| `uncertain` | `#A78BFA` | inconclusive / evidencia insuficiente. |
| `info` | `#60A5FA` | investigación en curso. |

El color nunca puede ser el único indicador: siempre acompañarlo de texto, icono y/o patrón. Usar tipografía con numerales tabulares para tasas, tiempos y USD; Geist/Inter son una buena base. Reservar mayúsculas y tracking amplio para labels, no para párrafos.

### Componentes reutilizables

- `HealthIndicator`
- `MetricCard`
- `SeverityBadge`
- `IncidentCard`
- `ApprovalChart`
- `AlertToast`
- `NotificationCenter`
- `InvestigationTimeline`
- `EvidenceCard`
- `CandidateRank`
- `RecommendationCard`
- `ChaosForm`
- `RevealComparison`
- `EmptyState` / `StreamDisconnectedState`

Todos deben aceptar datos de contratos o props simples derivadas, no respuestas HTTP crudas distribuidas por la UI.

### Motion y microinteracciones

- pulso lento únicamente en `LIVE` y en el paso de investigación que acaba de llegar;
- entrada de alerta firme, sin rebotes de “gaming UI”;
- transición del gráfico al punto anómalo cuando aparece un incidente;
- respetar `prefers-reduced-motion`;
- no animar una investigación si no llegaron `InvestigationStep` reales: una barra de espera honesta es mejor que una simulación engañosa.

### Accesibilidad y lectura de demo

- contraste suficiente, tooltips y labels visibles;
- no depender de hover para información crítica;
- navegación por teclado para Chaos Console;
- toda cifra con unidad (`pp`, `tx/min`, `USD/hour`);
- pantalla primaria pensada para 1440px, aceptable a 1280px;
- mobile es secundario: detalle y aviso legibles; la Chaos Console se usa en desktop/tablet. El teléfono de WhatsApp es evidencia del alert, no el dashboard entero.

## 11. Integración frontend: cómo avanzar sin bloquearse

### Estructura sugerida

```text
apps/web/
  app/
    page.tsx
    incidents/[id]/page.tsx
    chaos/page.tsx
  components/
    control-tower/
    incidents/
    chaos/
    notifications/
    ui/
  lib/
    api/              # fetchers y SSE/polling, sin JSX
    adapters/         # HTTP -> contratos/props de UI
    fixtures/         # casos tipados por contracts/types.ts
    format.ts
    state.ts
```

No duplicar `contracts/types.ts`: importarlo o usar una capa de adaptadores delgada. Las fixtures deben tipar contra esos contratos.

### Datos en vivo y fallback

- `GET /api/stream` es el stream existente de transacciones; consumirlo vía SSE si el backend lo expone como tal.
- Para incidentes, usar `GET /api/incidents` y refresco breve durante demo mientras no exista un evento de incidentes. No inventar una ruta SSE nueva.
- Al abrir detalle, usar `GET /api/incidents/:id` para candidates, evidence y steps.
- Mantener fixtures para que el frontend se pueda diseñar sin bloquearse, con un switch de entorno explícito `demo fixtures` vs. `live API`.
- Estado de error: `Backend unavailable — showing last known state` es preferible a una pantalla vacía o datos falsos.

### Sin Supabase por ahora

No se necesita para renderizar el dashboard ni enviar notificaciones. La fuente inicial puede ser el backend FastAPI y memoria/SQLite. Si más adelante se quiere replay histórico persistente o colaboración multiusuario visible, evaluar Supabase como decisión explícita, no como requisito del frontend.

## 12. Plan de construcción por prioridad

### P0 — empezar ya, sin depender de otros streams

1. Inicializar `apps/web` con Next.js, TypeScript, Tailwind y shadcn/ui, usando **pnpm**.
2. Crear tokens, shell global, layout desktop y modo presentación.
3. Importar contratos y crear fixtures tipadas para: normal, incidente provider×country, inconclusive y dos incidentes.
4. Construir la estructura de Control Tower: KPIs, chart con banda, cards y alerta in-app.
5. Construir el esqueleto de Incident Detail: hero, timeline, evidence cards, candidatos y recomendación.
6. Construir Chaos Console sin revelar dimensiones en random mode.
7. Diseñar template de email y preview de WhatsApp dentro de la UI; todavía sin credenciales.

### P1 — integración cuando existan servicios

1. Adaptadores de API, SSE de transacciones y polling temporal de incidentes.
2. Vincular `InvestigationStep` reales a la timeline.
3. Conectar `POST /api/chaos/*` y manejo de loading/error/reveal.
4. Implementar email real server-side con una cuenta de Resend y realizar un ensayo completo.
5. Validar dos incidentes simultáneos e `inconclusive` contra el backend, no solo fixtures.

### P2 — bonus solo si el núcleo es estable

1. Twilio WhatsApp Sandbox y un teléfono del equipo ya unido al sandbox.
2. Browser notification opcional.
3. Replay / incidente similar si el backend entrega memoria.
4. Vista ejecutiva resumida dentro del mismo detalle, no una app paralela.

## 13. Checklist de aceptación para la demo

- [ ] En tráfico normal no se muestra alerta ni color rojo persistente.
- [ ] Un incidente inyectado crea una alerta in-app visible y abre investigación sin recargar la página.
- [ ] El email llega a una casilla de prueba y su contenido no inventa una causa temprana.
- [ ] La timeline muestra pasos reales de backend o explícitamente “waiting for evidence”.
- [ ] El detalle comunica observado vs esperado, impacto, evidencia, alternativa y recomendación humana.
- [ ] `inconclusive` no se presenta como causa confirmada.
- [ ] Dos incidentes se ven como dos elementos priorizados, no como un total confuso.
- [ ] Random Chaos no filtra la verdad antes de reveal.
- [ ] Reveal compara dimensión por dimensión, severidad y tiempos.
- [ ] El sistema no ofrece ejecutar la recomendación.
- [ ] Si el backend cae, la UI informa el problema sin inventar eventos nuevos.
- [ ] El modo presentación se entiende a distancia en una pantalla de demo.

## 14. Decisiones que faltan y requieren acuerdo antes de integrar

| Decisión | Propuesta | Responsable para acordar |
|---|---|---|
| Email real | Resend como MVP y una casilla de demo compartida. | Stream D + quien gestione Vercel/secretos. |
| WhatsApp real | Twilio Sandbox solo después de estabilizar P1. | Stream D + dueño de la cuenta/teléfono. |
| Disparador server-side | Handler interno al crear anomalía confirmada; idempotencia por incidente/evento. | Stream B/C + backend owner. |
| Actualización de incidentes | polling temporal de `/api/incidents`; evaluar evento dedicado solo si todos acuerdan un cambio de contrato. | Streams C/D. |
| Recuperación | definir quién marca un incidente resuelto y con qué evidencia. | Streams B/C. |
| `rca_score` UI | tratarlo como prioridad técnica, nunca como porcentaje de confianza. | Stream B/D. |

## 15. Instrucción lista para el chat que construirá el frontend

> Leé `AGENTS.md`, `contracts/CONTRACTS.md`, `contracts/types.ts` y `docs/FRONTEND_UI_UX_SPEC.md` completos antes de editar. Sos el Stream D: creá el frontend en `apps/web` usando pnpm, Next.js, TypeScript, Tailwind y shadcn/ui. Construí primero las tres rutas (`/`, `/incidents/[id]`, `/chaos`) con fixtures estrictamente tipadas contra `contracts/types.ts`. Prioridad: una historia de demo clara — normalidad → alerta confirmada → investigación visible → evidencia → recomendación humana → reveal. No cambies contratos ni agregues endpoints; no expongas secretos; no implementes remediación automática. Dejá los adaptadores listos para `/api/stream`, `/api/incidents`, `/api/incidents/:id` y `/api/chaos/*`. Antes de cualquier integración de email/WhatsApp, pedí las credenciales y confirmá el dueño del handler server-side.

---

## Frase de control

**Si una pantalla no ayuda a demostrar qué pasó, por qué lo creemos y qué persona debe hacer después, no entra en el MVP.**
