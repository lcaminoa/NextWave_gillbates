# Handoff histórico — Stream D (producto / UI / UX)

> **Estado histórico.** Este documento fue escrito para transferir trabajo antes de la
> integración final. Para ejecutar o revisar el proyecto actual, usar primero el
> [`README.md`](../README.md), [`AGENTS.md`](../AGENTS.md) y
> `uv run uvicorn engine.main:app --reload --port 8000`.
> Las referencias a ramas sin mergear y a `engine.api.app:app` que aparecen más abajo no
> describen el estado actual de `main`.

Para una sesión nueva de Claude en otra máquina. Franco es el dueño de Stream D.
Rama: `feat/frontend-polish`. Todo lo de abajo ya está commiteado en esa rama.

---

## 1. Reglas no negociables

Estas vienen del dueño del stream y **tienen precedencia sobre cualquier criterio propio**.

- Tocá **solo `apps/web`** siempre que se pueda.
- **No modifiques `contracts/`, `simulator/`, endpoints, semántica de fixtures ni lógica de negocio.**
  (La excepción: en `engine/` ya hubo trabajo autorizado explícitamente para las notificaciones. No lo extiendas sin pedir permiso de nuevo.)
- No cambies adaptadores ni hooks live salvo que sea indispensable. Si hace falta, **pará y explicá primero**.
- **Nunca** agregues endpoints, secretos, API keys ni `.env` al repo.
- Usá **pnpm**. Nunca npm ni yarn.
- Después de cada bloque de trabajo: `pnpm build && pnpm lint` desde `apps/web`.
- Las pantallas operativas usan **solo datos vivos**. Si la API se cae, mostrá "unavailable".
  **Nunca inventes datos ni hagas fallback silencioso a fixtures.**
- Chaos `random_unknown` mantiene las dimensiones ocultas hasta el Reveal.
- **Toda recomendación queda humana.** Nunca agregues acciones de pago automáticas.
- El modo manual de Chaos tiene una limitación funcional conocida — **no lo toques** salvo pedido explícito.
- Preservá rutas y CTAs existentes.
- Commits chicos y claros. Proponé UX/UI antes de cambios grandes y esperá aprobación.
- No inventes un script de test si no existe.

**Identidad visual PHAROS:** oscuro, sobrio, premium, editorial, evidence-first.
Nada de cyberpunk, terminal de hacker, dashboard genérico, ni exceso de glassmorphism o gradientes.

---

## 2. Qué es PHAROS

Investigador de incidentes de pagos, para el NextWave Hackathon Challenge 2.
Detecta caídas de aprobación en un stream de transacciones, aísla el **corredor** responsable
(proveedor × país × método × banco × comercio) y produce un reporte con evidencia.

- **Engine:** FastAPI + Pydantic, baseline Beta-Binomial (scipy), stream SSE.
- **Frontend:** Next.js 16.3.3 (App Router, Turbopack), React 19.2.8, TypeScript, Tailwind v4, estructura shadcn.
- El globo es **D3 sobre canvas** con proyección ortográfica, no WebGL. three.js/R3F se usa aparte, solo en la escena de la landing.

Dimensiones sobre las que se generan candidatos — `engine/rootcause/candidates.py:21`:
```python
SEGMENT_DIMENSIONS = ["provider", "country", "payment_method", "issuing_bank", "merchant"]
```
Solo un tercio de las formas posibles incluye país. Por eso muchos incidentes **no tienen geografía**,
y eso es un hallazgo, no un hueco.

---

## 3. Cómo levantar todo

**Engine — corre en WSL, no en Windows.** Smart App Control de Windows bloquea las DLLs sin firmar de scipy.

```bash
# en WSL
uv run uvicorn engine.main:app --reload --port 8000
```

**No mates procesos de Windows que tengan el puerto 8000**: ése es el relay de WSL, no uvicorn.
Si rompés el forwarding de localhost, se arregla con `wsl --shutdown` desde Windows.

**Frontend — en Windows:**
```bash
cd apps/web
pnpm dev
```

Endpoints del engine: `/api/health`, `/api/incidents`, `/api/incidents/{id}`, `/api/stream`,
`/api/chaos/inject`, `/api/chaos/random`, `/api/chaos/reveal`.

---

## 4. Sistema de diseño

Todo vive en `apps/web/app/globals.css` (~4.400 líneas). Los tokens están en `:root` y `@theme inline`.
**Cambiá el diseño ahí, no con clases sueltas.**

Paleta actual, "Lamp":
```css
--pharos-canvas: #080a0f;  --pharos-surface: #10141b;  --pharos-raised: #171d26;
--pharos-ink: #edeae3;     --pharos-strong: #fbfaf7;   --pharos-muted: #a6a79f;
--pharos-accent: #e8c88a;  --pharos-accent-ink: #f3ddb0;
--signal-healthy: #4cc38a; --signal-warning: #f5a524;
--signal-critical: #f2555a; --signal-uncertain: #9b8afb; --signal-info: #5ea9f0;
--measure: 1380px; --gutter: clamp(20px, 3vw, 44px);
```
Superficies **planas**: no hay gradientes y se sacaron los 20 glows radiales. No los vuelvas a meter.
`--measure` y `--gutter` existen porque el contenido tocaba los bordes de la pantalla.

---

## 5. Estado actual

### Hecho
- Nav único para landing y producto, dos variantes, condensa al scrollear con histéresis (28/10).
- Storytelling de scroll en la landing: `paint(value)` escribe custom properties por frame,
  React solo guarda `activeIndex`. **No lo pases de vuelta a estado de React** — ése era el origen del jank.
- AnimatedBeam (Magic UI) con puertos en los bordes de las tarjetas, no en los centros.
- Paleta Lamp completa.
- Sistema de alertas: campana, toasts, panel de entrega por incidente, `/settings`.
- Chaos Lab con sign-in propio (cookie httpOnly firmada con HMAC) en vez del diálogo Basic Auth del browser.
- Panel "Affected corridors": globo secundario + libro mayor, resuelve país de hasta 6 investigaciones abiertas.

### Pendiente / conocido
- **El estado `reconnecting` nunca se implementó.** Requiere tocar la máquina de estados de
  `use-control-tower.ts`. Está señalado y nunca fue aprobado explícitamente.
- La rama tiene **36 commits y no está mergeada a `main`**. Antes de mergear, avisá a los autores
  de notificaciones y de blind-trial, según AGENTS.md.
- **El engine reporta cifras de revenue inverosímiles** (ej. USD 726.985/hora para 96 transacciones
  afectadas). Es territorio de Stream B. Señalado, no tocado.
- Con 6 corredores mapeados la columna derecha del panel de corredores pasaría al globo en altura.
  Hoy hay 3 y el tope del hook son 6.

---

## 6. Notificaciones (WhatsApp + Email) — LO MÁS IMPORTANTE PARA LA DEMO

El código está completo y testeado. **Está apagado por configuración.**

- **Resend** → `POST https://api.resend.com/emails`, con `Idempotency-Key`.
- **WhatsApp** → Meta Cloud API, `v{version}/{phone_number_id}/messages`. Modo `text` (necesita
  ventana de 24hs abierta) o `template` (necesita template aprobado).
- **Solo escalan `probable` y `confirmed`** — `engine/notifications/service.py:167`.
  `inconclusive` nunca manda nada.
- Estados: `queued / sending / accepted / failed / unknown / skipped`.
  **Nunca `delivered`**: que el proveedor acepte no es que llegue a una persona, y no hay callback
  de entrega. Es decisión de diseño deliberada, hay un test que lo hace cumplir.
- El `recipient_fingerprint` (SHA-256) está **excluido a propósito** del payload de la API.
  Ningún token, teléfono ni dirección llega al browser.

### El engine NO lee `.env`
No usa python-dotenv. Las variables tienen que estar **exportadas en el shell de WSL donde arranca
uvicorn**, y hay que **reiniciar el engine** después: `NotificationService.from_environment()`
se lee una sola vez al construir.

Plantilla en `.env.example`. Las claves: `PHAROS_NOTIFICATIONS_ENABLED`, `PHAROS_NOTIFICATION_MODE`,
`PHAROS_NOTIFICATION_INCIDENT_BASE_URL`, `RESEND_API_KEY`, `RESEND_FROM`,
`PHAROS_NOTIFICATION_EMAIL_TO`, `PHAROS_WA_ACCESS_TOKEN`, `PHAROS_WA_API_VERSION`,
`PHAROS_WA_PHONE_NUMBER_ID`, `PHAROS_NOTIFICATION_WHATSAPP_TO`, `PHAROS_WA_MESSAGE_MODE`.

Si falta cualquiera de los dos canales, el engine **falla al arrancar a propósito**: así nunca queda
una demo que parezca andar sin mandar nada.

### Verificar que quedó encendido
```bash
curl -s http://localhost:8000/api/incidents/INCIDENT_ID \
  | python -c "import json,sys;print(json.load(sys.stdin)['notification_dispatches'])"
```
`[]` en un incidente `probable` o `confirmed` → sigue apagado.

`engine/notifications/smoke.py` manda un mensaje real por los dos canales sin esperar al simulador.
Pide una variable de confirmación explícita para no disparar por accidente.

### Dónde se ve
| Superficie | Archivo |
|---|---|
| Alert delivery (3 canales, estado, id de Resend) | `components/incidents/alert-delivery.tsx` |
| Campana con contador | `components/notifications/notification-bell.tsx` |
| Toasts en vivo | `components/notifications/alert-toasts.tsx` |
| Alert routing | `components/settings/alert-routing.tsx` |

`/settings` son **preferencias locales del navegador**. No cambian lo que manda el runtime, y la
página lo dice explícito. No lo presentes como control real.

### Guion de demo
1. Chaos Lab → inyectás una falla fuerte.
2. Escala a `probable` → el toast salta y la campana suma, en vivo.
3. Abrís el incidente → Alert delivery: Email `Accepted by provider` con id de Resend, WhatsApp `Accepted`.
4. Mostrás el celular con el WhatsApp recién llegado. Es el momento fuerte y el único que no depende
   de la pantalla compartida.

---

## 7. Trampas ya pisadas — no las repitas

- **El panel de browser de Claude no pinta.** `requestAnimationFrame` nunca dispara, las transiciones
  CSS no avanzan y `getComputedStyle` devuelve los valores iniciales congelados. Los screenshots
  vuelven negros. **Medí geometría con JS; no confíes en lo visual.** Para animación y "feel",
  pedile a Franco que lo mire él.
- **HMR viejo** dio mediciones incorrectas dos veces. Ante algo raro, hard reload.
- `react-hooks/set-state-in-effect` salta seguido. Se resuelve con `startTransition` o con estado
  keyed (mirá `use-incident-locations.ts` como referencia).
- No filtres corredores por "escalado": de 11 investigaciones abiertas solo 1 estaba escalada y no
  tenía país, mientras 6 inconclusive sí lo tenían. El mapa responde "dónde hay trabajo abierto",
  no "dónde hay alarma".
- Un scrollbar adentro de un panel es peor que un panel alto: obliga al lector a descubrir que hay
  más para leer. Ya se corrigió una vez en el panel de corredores.

---

## 8. Verificación hecha

- Backend: **124 tests pasan**.
- Frontend: build y lint limpios.
- Producto probado end-to-end con inyecciones ciegas reales: `merchant=VuelaYa` encontrado sin ayuda,
  y `provider=nova_pay` con score **`exact`** (26s de detección, 1,6pp de error en severidad).
- Estados degradados verificados apagando el engine.
- Sign-in de Chaos verificado en los cuatro caminos (redirect 307 para HTML, 401 sin
  `WWW-Authenticate` para clientes programáticos, 401 genérico con credenciales incorrectas,
  cookie httpOnly sin la contraseña al entrar).
