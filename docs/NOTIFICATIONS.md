# Alertas operativas: Resend + WhatsApp

Esta primera implementación entrega **dos alertas reales por el mismo incidente elegible**:
un email mediante Resend y un WhatsApp mediante la Cloud API oficial de Meta. Está aislada del
frontend y del investigador: ninguna alerta puede alterar tráfico, ejecutar la recomendación ni
bloquear el stream de pagos.

## Qué se envía y cuándo

```text
Reporte validado y publicado
  -> outbox SQLite (local en desarrollo; Volume persistente en Railway)
  -> worker separado
       -> Resend (email)
       -> WhatsApp Cloud API
```

- Solo se encola un reporte `probable` o `confirmed`, con una raíz directa y evidencia publicada.
  Un reporte `inconclusive`, una hipótesis provisional o un fallo transitorio del investigador no
  genera un mensaje externo.
- La clave es por episodio, evento y canal. Dos ventanas del mismo incidente no duplican email ni
  WhatsApp; una recurrencia posterior sí obtiene un episodio nuevo.
- Los canales son independientes. Si falla Resend, WhatsApp igual se intenta, y viceversa.
- `accepted` significa que el proveedor devolvió un ID de mensaje. Sin webhooks todavía no se debe
  mostrar ni decir “entregado” o “leído”. Un timeout se registra como `unknown` y no se reintenta
  a ciegas, en especial para WhatsApp.
- El outbox conserva estado, ID del proveedor y un hash del destinatario. No conserva tokens ni el
  destinatario en claro. En Railway su base vive en un Volume con una única réplica; sin ese mount
  las notificaciones quedan desactivadas en vez de fingir durabilidad. La URL del mensaje va a `/investigations`, que sigue siendo válida aunque
  el runtime reemplace un reporte provisional por uno mejor evidenciado.

## Preparación humana necesaria

No pegues claves, tokens ni números en Codex/chat ni los subas a Git. Configuralos únicamente en
tu sesión local o en el gestor de secretos del deploy.

### 1. Resend para email

1. Creá un proyecto/API key nuevos o dedicados para PHAROS en Resend.
2. Para el smoke inmediato, usá `PHAROS <onboarding@resend.dev>` como remitente y el email de la
   misma cuenta de Resend como destinatario. Ese remitente de prueba no puede mandar a direcciones
   externas arbitrarias.
3. Si más adelante querés mandar a amigos/clientes o usar un remitente PHAROS propio, verificá un
   dominio y sus DNS SPF/DKIM en Resend. Eso es verificación de dominio, no una aprobación manual
   de Meta.

Resend documenta el envío, el header de idempotencia y la limitación del remitente de prueba en
[Send Email](https://resend.com/docs/api-reference/emails/send-email),
[Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys) y
[resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

### 2. Meta WhatsApp sin mezclar tu otro proyecto

1. En Meta for Developers creá una app nueva, por ejemplo **PHAROS Demo**. Dejala en modo
   desarrollo y agregale el producto WhatsApp.
2. En **API Setup**, usá el número de prueba y WABA de esa app nueva. Agregá y verificá solamente
   tu número como test recipient.
3. Copiá localmente el token temporal recién generado, el `Phone number ID` y la versión de Graph
   API que muestra Meta. El token temporal suele vencer pronto; generarlo justo antes del smoke
   evita sorpresas.
4. Desde tu teléfono mandá `READY` (o cualquier mensaje) al número de prueba y corré el smoke
   dentro de las siguientes 24 horas. Ese mensaje abre la ventana de customer service: en ella la
   demo puede contestar con `text` dinámico sin esperar la aprobación de un template.

No se reutilizan la app, WABA, número, token, webhook, clientes ni permisos de tu proyecto
personal. Fuera de esa ventana de 24 h Meta exige un template aprobado para iniciar un WhatsApp
personalizado; no existe una alternativa legítima e instantánea a esa regla. La referencia de
Cloud API está en la [documentación oficial de Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/)
y las reglas de uso en la [política de WhatsApp Business](https://whatsappbusiness.com/policy/).

## Variables locales

Partí de [`.env.example`](../.env.example), pero mantené los valores reales fuera de Git. El
engine lee variables de entorno del proceso; ese archivo es una referencia y no se carga solo.
Antes del smoke o de iniciar `uvicorn`, cargá los valores en tu terminal/gestor de secretos local
(por ejemplo, `$env:RESEND_API_KEY = "…"` en PowerShell) y nunca los pegues en este repositorio.
Con el modo demo y la ventana de 24 horas abierta, las variables requeridas son:

```dotenv
PHAROS_NOTIFICATIONS_ENABLED=true
PHAROS_NOTIFICATION_MODE=demo
PHAROS_NOTIFICATION_DB_PATH=.runtime/pharos-notifications.sqlite3
PHAROS_NOTIFICATION_INCIDENT_BASE_URL=http://localhost:3000
PHAROS_NOTIFICATION_REQUEST_TIMEOUT_SECONDS=8

RESEND_API_KEY=
RESEND_FROM="PHAROS <onboarding@resend.dev>"
PHAROS_NOTIFICATION_EMAIL_TO=

PHAROS_WA_ACCESS_TOKEN=
PHAROS_WA_API_VERSION=
PHAROS_WA_PHONE_NUMBER_ID=
PHAROS_NOTIFICATION_WHATSAPP_TO=
PHAROS_WA_MESSAGE_MODE=text
```

`PHAROS_NOTIFICATIONS_ENABLED` queda en `false` por defecto. En Railway el path se cambia a
`/data/pharos-notifications.sqlite3` una vez montado el Volume persistente. Si se lo pone en `true`, el proceso
falla al iniciar si falta **cualquiera** de los dos canales: así nunca queda una demo que parezca
dual pero solo envíe por uno.

Para fuera de la ventana de 24 h, cambiá `PHAROS_WA_MESSAGE_MODE=template` y agregá el nombre,
idioma y orden de campos del template ya aprobado:

```dotenv
PHAROS_WA_TEMPLATE_NAME=
PHAROS_WA_TEMPLATE_LANGUAGE=
PHAROS_WA_TEMPLATE_FIELDS=incident_id,status,estimated_revenue_loss_usd_per_hour,incident_url
```

## Smoke real explícito

Una vez configuradas ambas cuentas y enviado `READY`, se puede probar sin tocar el frontend:

```powershell
$env:PHAROS_NOTIFICATION_SMOKE_TEST = "1"
uv run python -m engine.notifications.smoke
Remove-Item Env:PHAROS_NOTIFICATION_SMOKE_TEST
```

El comando crea un único incidente de smoke y espera dos respuestas de proveedor. Sale con código
0 solo si ambos estados son `accepted`; no corre en tests ni en CI sin la confirmación explícita.

## Siguiente fase de producto

Cuando el smoke real esté en verde, el frontend puede sumar una tarjeta de alerta en el detalle y
en la demo: “Email accepted” + “WhatsApp accepted”, con fecha y sin exponer tokens, destinatarios
ni cuerpo completo. Para hacerlo hay que acordar con los cuatro streams el campo opcional de
ledger dentro del endpoint de detalle ya congelado; no agregaremos una ruta nueva solo para esto.
Los webhooks de Resend/Meta llegarán después, junto con una URL HTTPS pública y ese cambio de
contrato, para pasar de “accepted” a “delivered/read” cuando el proveedor lo confirme.
