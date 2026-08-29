# NextWave Hackathon 2026 — Desafío 2: **The Control Tower**
## Gill Bates — Investigación de mercado + plan de producto ganador

> **Estado:** desafío elegido  
> **Objetivo:** no construir «un dashboard con GPT». Construir un **investigador autónomo de incidentes de pagos, respaldado por evidencia**, que supere la prueba a ciegas de los jueces.  
> **Restricción del brief oficial:** diagnosticar y recomendar; **no remediar automáticamente**.

---

# 0. Recomendación ejecutiva

La dirección más sólida es:

## **Control Tower → Investigador autónomo de incidentes de pagos**

Un sistema que observa continuamente un flujo sintético de pagos en vivo, aprende qué es «normal», detecta degradaciones significativas de conversión y luego **inicia una investigación autónoma**.

Debe:

1. detectar el incidente sin umbrales estáticos hardcodeados;
2. separar una degradación real de la estacionalidad, el bajo volumen y el ruido aleatorio;
3. identificar el segmento afectado más pequeño entre:
   - comercio
   - proveedor
   - método de pago
   - país
   - banco emisor
   - código de rechazo
4. separar múltiples incidentes simultáneos;
5. estimar los ingresos perdidos por minuto/hora;
6. comparar el tráfico afectado con cohortes de control o proveedores alternativos;
7. generar hipótesis ordenadas con evidencia explícita y confianza;
8. decir **«no concluyente»** cuando la evidencia sea insuficiente;
9. recuperar incidentes históricos similares;
10. recomendar la próxima acción humana;
11. mostrar toda la investigación en vivo en una interfaz visualmente memorable;
12. superar una **prueba de caos a ciegas** en la que el juez inyecte un patrón que el investigador no haya visto de antemano.

El producto debe sentirse menos como «analítica de pagos» y más como:

> **Datadog Bits / un SRE de IA, pero creado específicamente para incidentes de conversión de pagos y potenciado por la visibilidad multiproveedor de Yuno.**

Ese posicionamiento es ambicioso y está directamente alineado con el brief.

---

# 1. Qué exige realmente el desafío

Fuente: **NextWave Hackathon 2026 — Challenges MASTER (EN), Challenge 2: The Control Tower**.

El sistema debe:

- monitorear un flujo de transacciones en vivo;
- detectar caídas de conversión relevantes;
- distinguir incidentes de efectos por hora del día, fines de semana, estacionalidad y varianza estadística;
- diagnosticar por comercio × proveedor × método × país × banco emisor × código de rechazo;
- explicar qué cayó, desde cuándo, a quién afecta, el impacto monetario y por qué el sistema cree en el diagnóstico;
- priorizar múltiples incidentes simultáneos;
- admitir incertidumbre cuando la evidencia sea insuficiente;
- recomendar una acción, pero **no ejecutar la remediación**;
- sobrevivir a la inyección en vivo de un incidente desconocido por parte de un juez.

Bonus:

- recordar incidentes repetidos;
- separar el detalle operativo del resumen ejecutivo;
- abstenerse en vez de alucinar.

### Implicación

La parte difícil **no es el dashboard**, ni siquiera la detección de anomalías por sí sola.

El problema técnico central es:

> **¿Podemos inferir en tiempo real la explicación defendible más pequeña para un cambio agregado de conversión, sin dejarnos engañar por ruido, bajo volumen, cambios en la mezcla de tráfico o correlaciones casuales?**

---

# 2. El mercado actual

Este desafío no es hipotético. Ya existe una categoría real: **observabilidad de pagos / inteligencia de pagos**.

Esto es útil porque podemos copiar patrones probados y también reconocer cuándo un proyecto de hackathon resultaría aburrido por limitarse a reproducirlos.

---

# 3. Yuno — qué importa específicamente para este desafío

## 3.1 Yuno no es simplemente otro PSP

Yuno es una **plataforma de orquestación de pagos**.

Un comercio se integra una vez y Yuno se ubica por encima de múltiples proveedores y métodos. Por eso puede ver patrones que un PSP individual no puede ver.

Esa posición multiproveedor es el hecho estratégico más importante para el Desafío 2.

Sitio oficial de Yuno:  
https://www.y.uno/

Yuno se posiciona actualmente como un sistema operativo de pagos nativo de IA, con agentes especializados en autorización, routing, fraude, recuperación, conciliación, payouts y más.

## 3.2 Yuno ya tiene “Monitors”

Esto es crítico.

Yuno ya comercializa **Monitors**, un producto de detección de anomalías en tiempo real, alertas y routing automatizado.

Página oficial:  
https://www.y.uno/es/product/monitors

Las capacidades publicadas incluyen:

- detección de anomalías en tiempo real;
- alertas personalizadas;
- respuesta o redireccionamiento automatizado;
- monitoreo del rendimiento de autorización de proveedores.

### Consecuencia para nosotros

Si construimos:

> gráfico de tasa de aprobación + alerta por umbral

habremos construido una versión más débil de un producto de Yuno que ya existe.

**No competir con Monitors en su conjunto básico de funcionalidades.**

Nuestro sistema debe comenzar donde termina Monitors:

> **«Se detectó una anomalía. Ahora investigá de forma autónoma qué ocurrió exactamente y producí un diagnóstico de causa raíz defendible».**

## 3.3 La propia Yuno dice que los dashboards no alcanzan

El artículo de Yuno de mayo de 2026, “Payment Analytics That Actually Drive Decisions (Not Just Dashboards)”, contrasta explícitamente los reportes pasivos con una analítica que explica **por qué** ocurrió algo y qué hacer a continuación.

Fuente:  
https://y.uno/es/blog/payment-analytics-that-actually-drive-decisions-not-just-dashboards

Lecciones importantes:

- los dashboards reactivos son demasiado lentos;
- la visibilidad multiproveedor es crucial;
- el análisis de tasa de aprobación debe llegar al nivel de emisor y código de rechazo;
- los equipos de pagos necesitan analítica orientada a decisiones;
- Payment Concierge de Yuno ya puede responder preguntas de pagos en lenguaje natural.

### Consecuencia

De nuevo: **un resumen GPT de un dashboard no es suficientemente novedoso.**

La oportunidad es un investigador que *elige activamente qué evidencia inspeccionar*.

## 3.4 El insight más relevante de Yuno: emparejamiento emisor–adquirente

El 4 de agosto de 2026, Yuno publicó específicamente sobre **incompatibilidades de emparejamiento emisor–adquirente**.

Fuente:  
https://www.y.uno/en/blog/issuer-acquirer-pairing-mismatches-the-root-cause-of-authorization-failures-that-no-single-provi

La idea importante:

Un proveedor individual solo ve sus propios rieles.

Yuno puede comparar el mismo emisor, mercado y tipo de pago entre distintos proveedores. Eso habilita diagnósticos como:

> «Itaú no está degradado globalmente. Las tarjetas Itaú se degradan únicamente cuando se enrutan por el Proveedor A».

Este es exactamente el tipo de RCA que premia el Desafío 2.

### Cómo debe influir en el producto

Nuestro motor de causa raíz debe explotar deliberadamente **grupos de control entre proveedores**.

No solo:

> «El Proveedor A está caído».

Sino:

> «Proveedor A × Itaú × Visa Brasil presenta una anomalía; Proveedor B × Itaú × Visa Brasil permanece normal».

Eso constituye evidencia mucho más fuerte.

---

# 4. Panorama competitivo

## 4.1 Primer — Observability + Monitors

Fuentes:

- https://www.primer.io/manage/observability
- https://www.primer.io/manage/monitors

Primer ya ofrece:

- visibilidad unificada de pagos;
- cientos de datos por pago;
- filtros granulares;
- monitoreo en tiempo real;
- detección dinámica de anomalías;
- modelos que aprenden la estacionalidad y los patrones normales;
- alertas sobre degradación de la tasa de autorización;
- análisis de experimentos y A/B.

### Copiar

- **baselines conscientes de la estacionalidad**;
- monitoreo granular por segmento;
- vista unificada de pagos;
- UX limpia para operaciones de pagos;
- encuadre por impacto de negocio.

### Evitar

No hacer que el operador investigue manualmente:

> alerta → abrir dashboard → país → PSP → emisor → código.

La IA debe realizar esa investigación automáticamente.

## 4.2 IXOPAY — el competidor directo más cercano

Fuentes:

- https://www.ixopay.com/products/payments-intelligence/anomaly-detection
- https://documentation.ixopay.com/modules/docs/payments-intelligence/observability/anomaly-detection
- https://www.ixopay.com/blog/ai-payments-expert-ixopay-ixonav

IXOPAY es probablemente el competidor más importante para estudiar porque ya tiene:

- detección de anomalías con ML;
- baselines predichos;
- intervalos de confianza;
- análisis sobre más de 50 dimensiones;
- explorador de anomalías;
- impacto financiero;
- AI Copilot / IXONav;
- análisis de causa raíz;
- recomendaciones;
- forecasting.

### Copiar

**Baseline predicho + banda de confianza** es una visualización excelente.

~~~text
aprobación esperada: 89–92 %
real:                67 %
~~~

También copiar:

- impacto financiero;
- drill-down dimensional;
- confianza;
- separación entre IA y analítica determinista.

### Evitar / oportunidad

Si solamente construimos «IXOPAY en 24 h», perdemos novedad.

Nuestro diferencial debe ser:

> **no un copiloto de IA que se abre después de ver una anomalía, sino un investigador autónomo que inicia la investigación, construye hipótesis, reúne evidencia, descarta alternativas y publica un diagnóstico auditable.**

## 4.3 Juspay — las mejores lecciones de arquitectura de observabilidad

Fuente:  
https://juspay.io/blog/what-is-payment-observability-solving-silent-failures-for-multi-psp-merchants

Es una de las fuentes más útiles para arquitectura.

### Conservar evidencia cruda y canónica del proveedor

Los proveedores usan taxonomías de errores distintas.

Conservar:

~~~text
raw_provider_code
raw_provider_message
~~~

y, por separado:

~~~text
canonical_decline_reason
~~~

Nunca descartar la evidencia cruda.

### Pending / unknown son estados reales

Un timeout no implica necesariamente que el pago haya fallado.

Para el desafío sintético podemos enfocarnos principalmente en autorización, pero el esquema no debe sugerir que todos los resultados no aprobados son idénticos.

### Una buena alerta necesita más que un umbral

Juspay resalta:

- cambio significativo de tasa;
- volumen mínimo;
- ventana de persistencia;
- segmento afectado;
- impacto de negocio.

Así evitamos la fatiga de alertas.

### Buscar la primera divergencia

Una investigación sólida compara el flujo afectado con un equivalente normal y pregunta:

> **¿En qué punto empezaron a comportarse de manera diferente?**

### Copiar

- evidencia cruda + canónica;
- filtros de volumen mínimo;
- persistencia;
- trazabilidad;
- próximo paso basado en evidencia.

### Evitar

No permitir que el LLM infiera cada vez la semántica de pagos directamente desde textos desordenados de proveedores. Normalizar primero.

## 4.4 Spreedly

Fuentes:

- https://developer.spreedly.com/docs/ai-analytics
- https://www.spreedly.com/products/optimize

Incluye:

- analítica interactiva de pagos;
- drill-down por gateway, marca de tarjeta, región y moneda;
- destacados de IA;
- detección de tendencias y anomalías;
- exploración de causa raíz;
- smart routing y optimización en su producto más amplio.

### Copiar

Transición visual altamente interactiva desde la señal general hasta la evidencia detallada.

### Evitar

“AI Highlights” no debe ser el protagonista. Nuestro protagonista es la investigación autónoma.

## 4.5 Gr4vy

Fuentes:

- https://docs.gr4vy.com/guides/dashboard/monitoring-and-alerting/overview
- https://gr4vy.com/analytics/dashboard/

Gr4vy ofrece analítica consolidada, monitores, umbrales personalizados, alertas, filtros y datos de transacciones en tiempo real.

### Copiar

- simplicidad;
- visibilidad rápida para el operador.

### Evitar

La configuración de umbrales estáticos o personalizados como motor primario de detección. El brief exige contemplar ruido y estacionalidad.

## 4.6 Datadog Bits AI — inspiración fuera del mundo de pagos

Es posiblemente la **inspiración de producto** más importante, aunque no sea un producto de pagos.

Fuentes:

- https://docs.datadoghq.com/bits_ai/bits_investigation/
- https://www.datadoghq.com/blog/building-bits-ai-sre/
- https://www.datadoghq.com/blog/engineering/bits-ai-eval-platform/

Bits Investigation:

- inicia investigaciones automáticamente;
- formula hipótesis;
- consulta telemetría;
- valida o rechaza hipótesis;
- actualiza iterativamente su investigación;
- termina con una causa raíz respaldada por evidencia;
- marca explícitamente una investigación como no concluyente cuando falta evidencia;
- se evalúa con escenarios de incidentes reales.

### Copiar casi directamente como filosofía de producto

Reemplazar:

~~~text
logs / trazas / servicios / deploys
~~~

por:

~~~text
comercios / PSP / métodos / países / emisores / códigos de rechazo
~~~

El resultado es:

> **un SRE de IA para conversión de pagos.**

Eso es mucho más ambicioso que «analítica de pagos».

## 4.7 Rootly AI SRE — evidencia + confianza

Fuente:  
https://rootly.com/ai-sre

Patrones útiles:

- causa raíz probable con confianza;
- cadena de evidencia;
- incidentes históricos similares;
- próximos pasos sugeridos explícitos;
- el humano mantiene el control.

### Copiar

Un diagnóstico debe venir **con su prueba incorporada**:

> cada afirmación enlaza a datos.

---

# 5. Nauta — por qué sigue importando aunque sea un desafío de Yuno

El Desafío 2 pertenece a Yuno, por lo que no debemos construir un producto logístico.

Sin embargo, la filosofía de producto de Nauta es relevante para entender cómo NextWave piensa la IA.

Fuentes:

- https://www.getnauta.com/
- https://www.getnauta.com/latam
- https://ai-workforce.getnauta.com/

La tesis central de Nauta es:

> los dashboards muestran problemas; los agentes deben entender el contexto operativo y hacer el trabajo.

Su “cerebro operativo” unifica datos y memoria para dar a los agentes suficiente contexto para actuar.

Nauta también tiene agentes como Shipment Watch, Root Cause, Freight Anomaly y Supplier Reliability.

### Lección para adoptar

Para el Desafío 2:

> **Control Tower no debe ser otra pantalla que le pida al humano investigar. Debe hacer el trabajo de investigación y entregar la única decisión que importa.**

Como el desafío prohíbe explícitamente la remediación automática:

> **El agente investiga. El humano decide.**

Es una adaptación perfecta de la filosofía de Nauta.

---

# 6. Brecha de mercado que debemos aprovechar

Los productos existentes ya ofrecen de forma individual la mayoría de estos elementos:

- dashboards;
- detección de anomalías;
- baselines estacionales;
- filtros;
- alertas;
- resúmenes de IA;
- impacto financiero;
- RCA manual;
- algo de RCA asistido por IA.

Por eso nuestro diferencial no puede ser uno solo de ellos.

## La brecha

### **Investigación de incidentes autónoma, auditable y multiproveedor**

El ciclo completo:

~~~text
FLUJO DE PAGOS EN VIVO
        ↓
MODELO DE COMPORTAMIENTO ESPERADO
        ↓
ANOMALÍA
        ↓
COMIENZA LA INVESTIGACIÓN AUTÓNOMA
        ↓
GENERAR HIPÓTESIS
        ↓
CONSULTAR / COMPARAR SEGMENTOS
        ↓
DESCARTAR ALTERNATIVAS
        ↓
SEPARAR INCIDENTES SIMULTÁNEOS
        ↓
CUANTIFICAR INGRESOS PERDIDOS
        ↓
BUSCAR EN LA MEMORIA DE INCIDENTES
        ↓
DIAGNÓSTICO RESPALDADO POR EVIDENCIA
        ↓
CONFIANZA / ABSTENCIÓN
        ↓
ACCIÓN HUMANA RECOMENDADA
~~~

---

# 7. Concepto de producto

## **Control Tower — Investigador autónomo de incidentes de pagos**

Pitch posible en una línea:

> **«Control Tower es un SRE de pagos con IA que detecta incidentes de conversión, los investiga autónomamente en todas las dimensiones de pago y produce una causa raíz respaldada por evidencia antes de que el comercio lo note».**

Alternativa:

> **«De “la conversión bajó” a “Proveedor B × Itaú × Visa Brasil se degrada desde las 14:03 y cuesta USD 12,4 mil por hora”, automáticamente».**

---

# 8. La demo “wow” que debemos diseñar primero

La demo no debe comenzar con un chatbot.

## Escena 1 — Todo está normal

Un enorme flujo de pagos en vivo.

~~~text
EN VIVO
12.431 tx/min

Aprobación
91,4 %

Esperado
90,8–92,1 %

Ingresos en riesgo
USD 0/min

Incidentes activos
0
~~~

No aparece ninguna alerta pese al ruido realista.

## Escena 2 — El juez inyecta caos

Ruta separada, segundo navegador o teléfono:

### **Chaos Console**

El juez puede elegir:

- incidente aleatorio;
- combinación arbitraria de dimensiones;
- severidad de la caída;
- duración;
- opcionalmente, incidentes simultáneos.

Ejemplo de verdad oculta:

~~~text
País: Brasil
Proveedor: NovaPay
Método: Tarjeta
Emisor: Itaú
Código de rechazo: 05
Caída de aprobación: -31 pp
~~~

**Importante:** el investigador nunca debe recibir esta verdad.

Solo la conoce el generador de transacciones.

## Escena 3 — Detección

En segundos:

~~~text
INCIDENTE DETECTADO

Delta de aprobación   -14,8 pp
Volumen afectado       1.842 tx/min
Fuga de ingresos       USD 187/min
Confianza              99,2 %
~~~

La investigación comienza automáticamente.

## Escena 4 — Mostrar a la IA investigando

No mostrar chain-of-thought oculta.

Mostrar **acciones de investigación observables + evidencia**:

~~~text
12:14:03  Anomalía confirmada contra baseline estacional
12:14:04  Escaneo por país → Brasil explica 83 % de las aprobaciones perdidas
12:14:05  Comparación de proveedores → NovaPay aislado
12:14:06  Comparación de métodos → Tarjetas aisladas
12:14:07  Controles por emisor → Itaú × NovaPay anormal
12:14:08  Mezcla de rechazos → código 05 aumentó 6,4×
12:14:09  El control con PSP alternativo permanece saludable
12:14:10  Confianza del diagnóstico elevada a ALTA
~~~

Esto es visualmente mucho más emocionante que un gráfico.

## Escena 5 — Causa raíz respaldada por evidencia

~~~text
CAUSA RAÍZ PROBABLE                         CONFIANZA ALTA

NovaPay × Itaú × Tarjetas en Brasil

Desde las 12:14:02
Tasa de aprobación: 91,1 % → 58,7 %   (-32,4 pp)
Volumen afectado: 1.842 tx/min
Pérdida estimada: USD 11.220/hora

Por qué lo creemos:
✓ Los demás emisores brasileños permanecen normales
✓ Itaú mediante el proveedor alternativo permanece normal
✓ El código de rechazo 05 aumentó 6,4×
✓ El patrón persistió durante 4 ventanas de evaluación

Descartado:
✗ Caída generalizada de emisores en Brasil
✗ Caída global de NovaPay
✗ Cambio en la mezcla de tráfico del comercio
~~~

La sección «Descartado» es importante.

## Escena 6 — Recomendación

El desafío pide diagnosticar, no remediar.

~~~text
ACCIÓN HUMANA RECOMENDADA

Enrutar temporalmente el tráfico de tarjetas emitidas por Itaú
en Brasil fuera de NovaPay y contactar a NovaPay con la evidencia adjunta.

No redirigir el resto del tráfico brasileño: no se detectó degradación.
~~~

No se ejecuta ninguna acción.

## Escena 7 — Revelar la verdad

El juez hace clic en **Revelar incidente inyectado**:

~~~text
Inyectado:
NovaPay × Itaú × Tarjetas × Brasil
-31 pp

Detectado:
NovaPay × Itaú × Tarjetas × Brasil
-32,4 pp

COINCIDENCIA DE CAUSA RAÍZ: 100 %
Latencia de detección: 8,1 s
~~~

Es un momento de hackathon extremadamente potente.

---

# 9. Diferenciadores técnicos

## 9.1 Baseline estadístico nativo de pagos

Evitar el discurso genérico de «detección de anomalías con IA».

La aprobación es naturalmente un **resultado binomial**:

~~~text
aprobados / intentados
~~~

Un modelo defendible es un baseline **Beta-Binomial / bayesiano empírico**.

Para cada segmento y bucket estacional:

- estimar la probabilidad esperada de aprobación;
- conservar la incertidumbre;
- los segmentos escasos obtienen intervalos naturalmente más amplios;
- los de gran volumen obtienen una confianza más ajustada.

Ventajas:

- interpretable;
- nativo de pagos;
- maneja bajo volumen;
- fácil de defender;
- evita fingir que 4/5 aprobaciones equivalen a un 80 % confiable.

Posibles agregados:

- hora del día;
- día de la semana;
- adaptación continua.

## 9.2 Detección secuencial de cambios

Sobre el baseline esperado:

- EWMA;
- CUSUM;
- detección de change-points;

para detectar rápidamente desviaciones sostenidas.

Una versión práctica para 24 h:

**baseline estacional + intervalo de confianza + persistencia + volumen mínimo + residuo EWMA**

es más defendible que aplicar Isolation Forest a todo.

## 9.3 Descomposición de la mezcla de tráfico — MUY IMPORTANTE

La tasa agregada de aprobación puede caer aunque **nada se haya roto**.

Ejemplo:

Ayer:

- 80 % del tráfico en un segmento con 95 % de aprobación;
- 20 % en uno con 70 %.

Hoy:

- 20 % en el primero;
- 80 % en el segundo.

La conversión global cae, pero ningún segmento se degradó.

Eso es un **cambio de composición o mezcla**, no un incidente de pagos. Puede generar una trampa similar a la paradoja de Simpson.

Construir una descomposición:

~~~text
Cambio de conversión observado
    =
efecto de composición del tráfico
    +
efecto de rendimiento dentro del segmento
~~~

UI:

~~~text
Conversión global: -5,8 pp

Efecto de mezcla:             -5,1 pp
Efecto real de rendimiento:   -0,7 pp

SIN INCIDENTE
Motivo: el tráfico se desplazó hacia pagos brasileños
con una conversión naturalmente menor.
~~~

Es útil e impresionante.

## 9.4 Búsqueda jerárquica y multidimensional de causa raíz

Dimensiones candidatas:

~~~text
merchant
provider
payment_method
country
issuing_bank
decline_code
~~~

Usar beam search o exploración jerárquica.

Ordenar segmentos candidatos con algo como:

~~~text
Puntaje RCA =
    impacto_de_negocio
  × confianza_estadística
  × cobertura_del_incidente
  × especificidad
  - penalización_por_complejidad
~~~

Una buena causa raíz explica gran parte de la pérdida mediante un segmento coherente y relativamente específico.

## 9.5 Controles contrafácticos entre proveedores

Esto aprovecha la posición única de Yuno.

Si:

~~~text
Itaú mediante NovaPay   → degradado
Itaú mediante AtlasPay → normal
~~~

la evidencia señala una **interacción emisor–proveedor**, no una caída general del emisor.

Del mismo modo:

~~~text
NovaPay con Itaú   → degradado
NovaPay con Nubank → normal
~~~

La intersección es más fuerte que cualquiera de los agregados.

## 9.6 Estimador contrafáctico de ingresos

Para cada segmento afectado:

~~~text
Aprobaciones esperadas = intentos × tasa de aprobación esperada
Aprobaciones reales
Aprobaciones perdidas  = esperadas - reales

Ingresos perdidos ≈
Σ(aprobaciones perdidas × valor esperado de la orden aprobada)
~~~

Mejor aún: mostrar un intervalo de confianza.

~~~text
Fuga estimada:
USD 10,4–12,7 mil / hora
~~~

## 9.7 Separación de múltiples incidentes

El brief exige explícitamente dos incidentes simultáneos.

No fusionarlos en una sola «caída global».

~~~text
INCIDENTE A
Brasil × NovaPay × Itaú
USD 11 mil/h

INCIDENTE B
México × Comercio 3 × Santander
USD 4 mil/h
~~~

Implementación posible:

1. encontrar segmentos anómalos con puntaje alto;
2. asignar de forma greedy los residuos anómalos al mejor incidente;
3. retirar el residuo explicado;
4. buscar nuevamente;
5. detenerse cuando la masa anómala restante esté bajo el umbral.

Es un enfoque simple de **set-cover / explicación residual**.

## 9.8 Diagnóstico con prueba incorporada

El LLM no puede afirmar nada que el motor determinista no respalde.

Cada afirmación referencia evidencia:

~~~json
{
  "claim": "El problema está aislado a tarjetas Itaú mediante NovaPay en Brasil",
  "evidence_ids": ["E12", "E18", "E21"],
  "confidence": 0.94
}
~~~

La UI permite al juez abrir la evidencia. Esto ataca directamente la debilidad de «el LLM alucinó la causa raíz».

## 9.9 Incertidumbre / abstención explícita

Tres estados:

~~~text
CONFIRMADO / CONFIANZA ALTA
PROBABLE
NO CONCLUYENTE
~~~

Si el volumen es bajo o dos explicaciones son estadísticamente indistinguibles:

> **«Detectamos degradación, pero la evidencia actual no permite distinguir un problema del proveedor de uno específico del emisor. Se necesitan más muestras o el estado externo del proveedor».**

Esto puede impresionar al jurado más que una respuesta incorrecta y confiada.

## 9.10 Memoria histórica de incidentes

Cada incidente resuelto tiene una huella:

~~~text
dimensiones afectadas
firma del cambio
cambio de distribución de códigos de rechazo
perfil temporal
impacto
diagnóstico
acción recomendada
~~~

Guardar la huella estructurada y un embedding del reporte.

Ante un incidente nuevo:

~~~text
INCIDENTE SIMILAR ENCONTRADO
25 de agosto, 03:13 — similitud 92 %

Mismo patrón proveedor / emisor
Causa anterior: degradación del emparejamiento emisor–adquirente
~~~

Importante: **el historial aporta contexto, no prueba.**

## 9.11 Escéptico / verificador de evidencia

Opcional pero potente:

~~~text
Investigador
    ↓
Paquete de evidencia
    ↓
Verificador / guardrail
    ↓
Diagnóstico publicado
~~~

El verificador controla:

- que cada afirmación tenga IDs de evidencia;
- que la confianza concuerde con la confianza estadística;
- que la recomendación no exceda el alcance del desafío;
- que no haya lenguaje causal sin respaldo.

No construir un inútil «enjambre de 5 agentes». Si usamos dos, la separación debe tener un motivo.

---

# 10. Dónde encaja OpenAI

El motor estadístico debe calcular estadísticas.

El LLM debe **razonar sobre evidencia y elegir acciones de investigación**.

## Herramientas sugeridas para el agente investigador

~~~text
get_global_health()
get_segment_metrics(filters, window)
compare_to_baseline(filters, window)
rank_dimension_anomalies(dimension, filters)
compare_provider_controls(filters)
get_decline_mix(filters)
estimate_financial_impact(filters)
get_incident_candidates()
search_incident_memory(query)
get_recent_changes()
~~~

El agente puede decidir:

> «El país parece concentrado en Brasil. Comparar proveedores dentro de Brasil».

Luego llama a la herramienta correcta.

### OpenAI debe hacer

- planificación de la investigación;
- exploración adaptativa de hipótesis;
- combinación de evidencia;
- decisión sobre qué inspeccionar a continuación;
- explicación en lenguaje natural;
- salidas ejecutivas y operativas;
- recomendaciones;
- interpretación de similitud histórica.

### OpenAI NO debe hacer

- calcular conversión desde filas crudas;
- inventar p-values;
- decidir si una muestra es estadísticamente significativa;
- estimar ingresos mediante cálculo mental;
- inferir silenciosamente datos que el sistema no posee.

---

# 11. Opciones de implementación con OpenAI

El OpenAI Agents SDK actual admite function tools, structured outputs, orquestación de agentes, guardrails y tracing.

Documentación:

- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/tools/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/tracing/

### Recomendación fuerte

Usar primero **un único agente Investigador principal**.

No sobrediseñar una arquitectura multiagente antes de que funcione el núcleo.

Segunda capa opcional:

**Auditor de evidencia / guardrail de salida**.

Agregarla solo después de que el flujo completo de prueba funcione.

---

# 12. Modelo de datos sugerido

Transacción canónica:

~~~json
{
  "transaction_id": "txn_123",
  "timestamp": "2026-08-29T14:03:21.223Z",

  "merchant": "merchant_a",
  "provider": "nova_pay",
  "payment_method": "card",
  "country": "BR",
  "issuing_bank": "itau",

  "approved": false,
  "amount": 132.40,
  "currency": "USD",

  "raw_provider_code": "05",
  "raw_provider_message": "DO NOT HONOR",
  "canonical_decline_code": "do_not_honor",

  "latency_ms": 481
}
~~~

No exponer PII innecesaria.

---

# 13. Diseño del mundo sintético

El desafío permite inventar datos.

El simulador debe ser lo suficientemente realista como para impedir que el investigador haga trampa.

## Entidades

- 5–8 comercios;
- 4 proveedores;
- México, Colombia, Brasil y opcionalmente Argentina;
- Tarjeta, PIX, PSE, Wallet;
- 5–10 emisores por mercado de tarjetas;
- motivos de rechazo:
  - insufficient_funds
  - do_not_honor
  - issuer_unavailable
  - suspected_fraud
  - authentication_required
  - provider_timeout
  - invalid_data

## Realismo del baseline

Distintas combinaciones tienen naturalmente distintas tasas de aprobación.

~~~text
PIX Brasil           98 %
Tarjetas Brasil      88 %
PSE Colombia         93 %
Wallet México        96 %
~~~

El rendimiento de los proveedores varía por mercado. Los emisores también.

Agregar:

- tráfico según hora del día;
- volumen de fin de semana;
- varianza natural;
- distribuciones del monto de la orden.

De lo contrario, detectar anomalías será demasiado fácil.

---

# 14. Chaos Injector

Es una funcionalidad central, no una herramienta de desarrollo.

Interfaz separada:

~~~
/chaos
~~~

El operador o juez puede elegir:

~~~text
dimensiones afectadas:
[merchant?]
[provider?]
[method?]
[country?]
[issuer?]
[decline code?]

degradación de aprobación:
[-5 a -50 pp]

inicio:
[ahora]

duración:
[continua / N minutos]
~~~

### Mejor: modo aleatorio a ciegas

Botón:

## **INYECTAR INCIDENTE DESCONOCIDO**

El sistema elige un incidente al azar y oculta la configuración.

El pipeline de análisis solo recibe las transacciones generadas.

Al final:

## **REVELAR VERDAD**

Es una prueba extraordinaria de que la demo no está hardcodeada.

---

# 15. Escenarios que debemos probar

Antes del code freeze, ejecutar automáticamente decenas o cientos.

## A. Sin incidente

Estacionalidad normal + ruido. Esperado: **SIN ALERTA**.

## B. Degradación general de proveedor

Proveedor B, todos los países, -20 pp. Causa esperada: Proveedor B.

## C. Proveedor × país

Proveedor B × Brasil.

## D. Proveedor × emisor

Proveedor B × Itaú.

## E. Regresión de un comercio

Comercio C.

## F. Caída de emisor

Santander México en todos los proveedores.

## G. Aumento de un código de rechazo

Crece un motivo de rechazo canónico específico.

## H. Solo cambio de mezcla

La aprobación global cambia por más tráfico de baseline bajo. Esperado: **SIN INCIDENTE / CAMBIO DE COMPOSICIÓN**.

## I. Falsa anomalía de bajo volumen

2 aprobaciones de 5. Esperado: **EVIDENCIA INSUFICIENTE**.

## J. Dos incidentes simultáneos

Exigido por el brief.

## K. Incidente histórico repetido

Esperado: recuperación de la huella previa.

---

# 16. Métricas de evaluación

Ejecutarlas; no inventar números.

### Detección

- tasa de detección;
- latencia media de detección;
- tasa de falsos positivos.

### RCA

- coincidencia exacta de causa raíz;
- coincidencia parcial de dimensiones;
- tasa de diagnósticos demasiado específicos;
- tasa de diagnósticos demasiado generales.

### Incertidumbre

- corrección de la abstención;
- calibración de confianza.

### Múltiples incidentes

- cantidad separada correctamente.

### Negocio

- error de estimación del impacto en ingresos.

Si el sistema realmente obtiene buenos resultados, mostrar uno simple en el pitch:

> «Ejecutamos 100 incidentes sintéticos a ciegas antes de la demo. El sistema aisló correctamente X % y produjo Y falsos positivos».

Reportar únicamente resultados medidos.

---

# 17. UI / experiencia

No construir 12 páginas.

## Control Tower principal

Métricas principales:

- aprobación en vivo;
- rango esperado;
- fuga actual de ingresos;
- incidentes activos;
- volumen del flujo.

Debajo:

- gráfico de conversión en vivo con banda de confianza;
- tarjetas de incidentes activos;
- timeline de investigaciones recientes.

## Detalle del incidente

### Encabezado

~~~text
SEV-1 · CONFIANZA ALTA

Brasil · NovaPay · Itaú · Tarjeta

Fuga de ingresos
USD 187/min
~~~

### Grafo de causa raíz

~~~text
GLOBAL
  ↓
BRASIL
  ↓
NOVAPAY
  ↓
TARJETA
  ↓
ITAÚ
~~~

Las ramas hermanas saludables aparecen atenuadas.

### Evidencia

- esperado vs. real;
- volumen;
- cambio en códigos de rechazo;
- controles.

### Descartado

Importante visualmente.

### Incidente similar

Una tarjeta.

### Acción humana recomendada

Clara y acotada.

---

# 18. Una animación de investigación memorable

No una animación falsa.

Transmitir pasos reales producidos por el backend:

~~~text
✓ Confirmando desviación...
✓ Revisando mezcla de tráfico...
✓ Escaneando dimensión país...
✓ Brasil aislado.
✓ Comparando proveedores...
✓ NovaPay aislado.
✓ Probando caída general del emisor...
✓ Proveedor alternativo saludable.
✓ Inspeccionando cambio de códigos de rechazo...
✓ Umbral de evidencia alcanzado.
~~~

Esto da movimiento a la demo y permite que la audiencia entienda qué hizo el sistema.

---

# 19. Cuatro líneas de trabajo paralelas

Una vez congelados los contratos, dividir en cuatro áreas mayormente independientes.

## Stream A — Simulación de pagos + datos

Responsabilidades:

- generador de transacciones;
- distribuciones de baseline realistas;
- estacionalidad;
- chaos injector;
- flujo WebSocket/SSE;
- separación de la verdad oculta.

Contrato entregable:

~~~text
flujo de eventos Transaction canónicos
~~~

## Stream B — Detección + RCA / ML

Responsabilidades:

- baseline;
- detección de anomalías;
- confianza;
- descomposición de cambio de mezcla;
- búsqueda dimensional;
- separación de múltiples incidentes;
- impacto en ingresos.

Entregable:

~~~text
IncidentCandidate[]
Evidence[]
~~~

## Stream C — Investigador OpenAI

Responsabilidades:

- capa de herramientas;
- agente Investigador principal;
- esquema estructurado del reporte;
- memoria histórica;
- explicaciones enlazadas a evidencia;
- verificador opcional.

Entregable:

~~~text
IncidentReport
InvestigationStep[]
~~~

## Stream D — Producto / UI / demo

Responsabilidades:

- UI de Control Tower;
- gráficos en vivo;
- página de incidente;
- visualización de causa raíz;
- timeline de investigación;
- UI de caos;
- modos ejecutivo y operaciones;
- deployment.

Usar mocks desde el primer momento; no esperar al backend.

---

# 20. Contratos compartidos antes de programar en paralelo

Antes de que cuatro sesiones de Codex trabajen por separado, congelar:

~~~text
Transaction
BaselinePoint
Anomaly
Evidence
IncidentCandidate
InvestigationStep
IncidentReport
ChaosSpec
~~~

También congelar los nombres de endpoints:

~~~text
GET  /api/health
GET  /api/stream
GET  /api/incidents
GET  /api/incidents/:id

POST /api/chaos/inject
POST /api/chaos/random
POST /api/chaos/reveal
~~~

---

# 21. Stack sugerido

## Frontend

- Next.js;
- TypeScript;
- Tailwind;
- shadcn/ui;
- Recharts u otra biblioteca conocida de gráficos;
- SSE/WebSocket.

## Análisis / simulador

Python es natural:

- FastAPI;
- Pydantic;
- NumPy;
- pandas o Polars;
- scipy / statsmodels donde sean útiles.

No instalar 25 frameworks de ML.

## Datos

Para la hackathon:

- memoria + DuckDB / SQLite puede ser suficiente;
- Postgres/Supabase solo si la persistencia realmente aporta.

Evitar teatro de infraestructura.

## IA

- OpenAI API;
- Agents SDK o Responses API;
- structured outputs;
- function tools;
- tracing.

---

# 22. Qué NO hacer

## ❌ «GPT lee un CSV»

Escala y confiabilidad pobres; difícil de defender.

## ❌ Isolation Forest porque «es ML»

Usar técnicas apropiadas para proporciones y series temporales.

## ❌ Umbral estático

~~~text
approval < 80 → alert
~~~

Falla ante estacionalidad, mercados y volúmenes distintos.

## ❌ Patrones de prueba hardcodeados

Los jueces los romperán.

## ❌ «Causa raíz» basada solo en el segmento malo más grande

Se necesitan controles y confianza.

## ❌ Diez agentes autónomos

Más componentes no equivale a más inteligencia. Un ciclo de investigación sólido supera a un enjambre arbitrario.

## ❌ Permitir que el LLM calcule estadísticas

Darle herramientas que devuelvan estadísticas confiables.

## ❌ Redirigir tráfico automáticamente

El desafío oficial dice explícitamente **recomendar, no ejecutar remediación**.

## ❌ Construir un dashboard enorme

La estrella es la investigación.

---

# 23. Niveles de prioridad

## MUST — sin esto no somos competitivos

1. flujo en vivo realista;
2. detección consciente de estacionalidad y ruido;
3. inyección de incidente arbitrario desconocido;
4. RCA multidimensional;
5. evidencia;
6. impacto en ingresos;
7. explicación OpenAI;
8. prueba end-to-end;
9. múltiples incidentes;
10. camino de «evidencia insuficiente».

## SHOULD — diferenciadores probables

11. descomposición de cambio de mezcla;
12. análisis de control entre proveedores;
13. timeline de investigación;
14. mapa visual de causa raíz;
15. memoria histórica de incidentes;
16. explicaciones ejecutivas / operativas;
17. revelación a ciegas / puntaje automático.

## STRETCH — solo cuando el núcleo sea muy sólido

18. auditor de evidencia;
19. inyección de caos en lenguaje natural;
20. grafo causal;
21. dashboard automatizado de evaluación de 100 casos;
22. jerarquía bayesiana sofisticada;
23. salida de alerta estilo Slack.

---

# 24. Inyección de caos en lenguaje natural — “wow” opcional

El juez escribe:

> «Hacé que las tarjetas Itaú procesadas por NovaPay en Brasil se degraden lentamente unos 25 puntos y creá además una caída separada para un comercio mexicano».

OpenAI lo convierte en un ChaosSpec validado.

Luego el generador lo inyecta.

Importante:

- mostrar al juez la configuración interpretada antes de activarla;
- el investigador no debe recibirla;
- usar únicamente salida estructurada.

Esto vuelve a la propia prueba parte del show.

Mantener controles estructurados como fallback.

---

# 25. Ideas fuera de lo común para considerar

## Idea A — El gemelo contrafáctico

Cada segmento afectado se compara con su «gemelo» saludable más cercano.

~~~text
Afectado:
Brasil / Itaú / NovaPay / Tarjeta

Contrafáctico:
Brasil / Itaú / AtlasPay / Tarjeta
~~~

UI:

> «Mismo emisor, mismo mercado, mismo método. Distinto proveedor. Saludable».

Evidencia muy fuerte.

## Idea B — Reloj de fuga de ingresos

En vez de un número estático:

~~~text
USD 14.209
USD 14.231
USD 14.258
~~~

Un contador en vivo.

## Idea C — Árbol de investigación

Mostrar las hipótesis exploradas:

~~~text
Brasil                  ✓ relevante
  Proveedor A           ✗ normal
  NovaPay               ✓ relevante
    Tarjeta             ✓ relevante
      Itaú              ✓ raíz
      Nubank            ✗ normal
México                  ✗ normal
~~~

## Idea D — «¿Qué engañaría a un dashboard normal?»

Crear un escenario de demo que engañe a los agregados globales.

Por ejemplo, dos efectos se cancelan:

- Proveedor A colapsa en Brasil;
- el tráfico de México se desplaza a un método de alta conversión.

La aprobación global casi no cambia. Un monitor global ingenuo dice que todo está bien.

Nuestro motor multidimensional detecta la pérdida oculta de Brasil.

Podría ser una demo excepcional.

## Idea E — Protección contra paradoja de Simpson / cambio de mezcla

Como se describió anteriormente.

## Idea F — Paquete de incidente autogenerado

Después del diagnóstico, crear un paquete compacto de escalamiento al proveedor:

~~~text
ID de incidente
ventana temporal
dimensiones afectadas
esperado vs. real
distribución de códigos de rechazo
cohorte de control
impacto financiero
evidencia de respaldo
~~~

El humano puede enviarlo al PSP. No se ejecuta remediación.

## Idea G — Explicar a dos audiencias

### OPERACIONES

Evidencia detallada.

### EJECUTIVO

> «Incidente de pagos en Brasil: ~USD 11 mil/h en riesgo. Aislado a NovaPay × Itaú. Los demás proveedores están saludables».

Es un bonus oficial.

---

# 26. La historia de pitch más fuerte posible

## Hook

> «Los incidentes de pagos no se anuncian. La conversión simplemente empieza a perder dinero».

## Problema actual

> «Hoy un operador ve un gráfico y luego segmenta manualmente por país, proveedor, emisor y código de rechazo hasta encontrar el problema».

## Insight

> «Yuno ya ve a todos los proveedores. Eso significa que la propia investigación puede volverse autónoma».

## Producto

> «Construimos un SRE de pagos con IA».

## Prueba en vivo

> «No confíen en nuestro escenario pregrabado. Inyecten uno ustedes».

El juez inyecta un incidente desconocido. El sistema lo encuentra.

## Distinción técnica clave

> «El modelo nunca adivina estadísticas. Un motor nativo de pagos para detección y RCA produce evidencia; el agente decide qué investigar después y solo puede publicar afirmaciones respaldadas por esa evidencia».

## Cierre

> «Control Tower transforma una caída de aprobación que demandaba investigar a las tres de la mañana en un diagnóstico respaldado por evidencia en segundos».

---

# 27. Argumentos para la defensa técnica

## ¿Por qué no solamente un LLM?

Porque el problema es estadístico. Los LLM orquestan la investigación; las herramientas estadísticas deterministas establecen la evidencia.

## ¿Por qué no usar umbrales estáticos?

Porque distintos mercados, horarios y segmentos tienen diferentes conversiones y volúmenes esperados.

## ¿Por qué no Isolation Forest?

La aprobación es una proporción binomial con marcada estacionalidad y escasez jerárquica. Un baseline nativo de pagos es más fácil de interpretar y defender.

## ¿Cómo se evitan falsos positivos?

- baseline estacional;
- volumen mínimo de muestra;
- persistencia;
- intervalo de confianza;
- descomposición de cambio de mezcla.

## ¿Cómo se evita alucinar la causa raíz?

- salidas estructuradas de herramientas;
- IDs de evidencia;
- estadísticas deterministas;
- validación del reporte;
- abstención.

## ¿Por qué Yuno puede hacerlo mejor que un PSP?

Porque posee visibilidad neutral entre proveedores y puede usar PSP alternativos como controles.

## ¿Qué pasa con dos incidentes?

La descomposición residual o por segmentos crea candidatos separados en vez de forzar una explicación global.

## ¿Qué pasa si la evidencia es ambigua?

Publicar «no concluyente» y enumerar la evidencia necesaria para diferenciar las hipótesis.

---

# 28. Registro de decisiones — comenzar ahora

Entregable obligatorio.

Crear DECISIONS.md.

Plantilla:

~~~md
## D001 — Enfoque de detección

Alternativas:
1. umbral estático
2. Isolation Forest
3. baseline Beta-Binomial estacional + detección secuencial de residuos

Decisión:
3

Por qué:
- la aprobación es una proporción binomial
- maneja bajo volumen mediante incertidumbre
- es interpretable para la defensa técnica
- admite naturalmente buckets estacionales
- resulta más fácil calibrar falsos positivos

Tradeoff:
es menos genérico que ML no supervisado, pero está mejor alineado
con la métrica de pagos.
~~~

Agregar cada decisión arquitectónica importante a medida que ocurra.

---

# 29. Primer orden de construcción

## Primeros 30–45 minutos

No programar por separado todavía.

Acordar:

- frase de producto;
- demo;
- contratos;
- arquitectura;
- lista MUST;
- división del trabajo.

## Después, paralelizar inmediatamente

### Flujo de datos

Poner las transacciones en movimiento.

### RCA

Detectar un incidente simple y conocido.

### IA

Lograr herramientas + un reporte estructurado sobre evidencia simulada.

### UI

Construir completamente contra mocks.

---

# 30. Hitos de integración

## Hito 1

Flujo normal visible.

## Hito 2

Un incidente simple de proveedor: detectado y mostrado.

## Hito 3

Incidente desconocido proveedor × país: correctamente aislado.

## Hito 4

El agente genera un reporte respaldado por evidencia.

## Hito 5

UI de caos para el juez.

En este punto ya existe una entrega legítima.

## Hito 6

Controles entre proveedores.

## Hito 7

Múltiples incidentes.

## Hito 8

Cambio de mezcla / incertidumbre.

## Hito 9

Memoria histórica + pulido + evaluaciones.

---

# 31. Mayor riesgo

El mayor riesgo sigue siendo:

> **construir un hermoso dashboard de analítica de pagos con un resumen de IA.**

Eso ya es el estándar del mercado.

El producto debe **realizar visiblemente trabajo de investigación**.

Si hay que recortar funcionalidades, conservar:

~~~text
INCIDENTE DESCONOCIDO
      ↓
DETECTADO
      ↓
INVESTIGACIÓN AUTÓNOMA
      ↓
EVIDENCIA
      ↓
CAUSA RAÍZ CORRECTA
~~~

Todo lo demás es secundario.

---

# 32. Alcance final recomendado

Si hubiera que fijar ahora el producto «ganador»:

### Núcleo

- flujo sintético de pagos en tiempo real;
- detección consciente de estacionalidad e incertidumbre;
- RCA multidimensional genérico;
- controles entre proveedores;
- investigador autónomo OpenAI;
- reporte con prueba incorporada;
- estimación de costo;
- incertidumbre / abstención;
- dos incidentes simultáneos.

### Wow

- Chaos Console a ciegas para el juez;
- traza de investigación en vivo;
- grafo de causa raíz;
- contador en vivo de fuga de ingresos;
- revelación de verdad + puntaje.

### Diferenciadores técnicos inteligentes

- descomposición de mezcla de tráfico;
- comparación contrafáctica proveedor/emisor;
- huella histórica de incidentes.

### Solo si queda tiempo

- caos en lenguaje natural;
- auditor de evidencia;
- dashboard completo de evaluación.

---

# 33. Fuentes / bibliografía de investigación

## Desafío

- NextWave Hackathon 2026 — Challenges MASTER (EN), Challenge 2 “The Control Tower” — provisto por los organizadores.

## Yuno

- https://www.y.uno/
- https://www.y.uno/es/product/monitors
- https://y.uno/es/blog/payment-analytics-that-actually-drive-decisions-not-just-dashboards
- https://www.y.uno/en/blog/issuer-acquirer-pairing-mismatches-the-root-cause-of-authorization-failures-that-no-single-provi
- https://www.y.uno/en/blog/what-happens-when-you-let-ai-analyze-your-payment-data

## Primer

- https://www.primer.io/manage/observability
- https://www.primer.io/manage/monitors

## IXOPAY

- https://www.ixopay.com/products/payments-intelligence
- https://www.ixopay.com/products/payments-intelligence/anomaly-detection
- https://documentation.ixopay.com/modules/docs/payments-intelligence/observability/anomaly-detection
- https://www.ixopay.com/blog/ai-payments-expert-ixopay-ixonav

## Juspay

- https://juspay.io/blog/what-is-payment-observability-solving-silent-failures-for-multi-psp-merchants

## Spreedly

- https://developer.spreedly.com/docs/ai-analytics
- https://www.spreedly.com/products/optimize

## Gr4vy

- https://docs.gr4vy.com/guides/dashboard/monitoring-and-alerting/overview
- https://gr4vy.com/analytics/dashboard/

## Stripe / Adyen — semántica de errores de pago

- https://docs.stripe.com/declines/card
- https://docs.stripe.com/declines/network-codes
- https://docs.adyen.com/point-of-sale/error-scenarios/raw-acquirer-responses

## Datadog / investigación de incidentes con IA

- https://docs.datadoghq.com/bits_ai/bits_investigation/
- https://www.datadoghq.com/blog/building-bits-ai-sre/
- https://www.datadoghq.com/blog/engineering/bits-ai-eval-platform/

## Rootly

- https://rootly.com/ai-sre

## Nauta

- https://www.getnauta.com/
- https://www.getnauta.com/latam
- https://ai-workforce.getnauta.com/

## OpenAI Agents SDK

- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/tools/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/tracing/

---

# 34. Una frase para mantener alineado al equipo

> **No estamos construyendo un dashboard que muestra un incidente de pagos. Estamos construyendo un investigador de pagos con IA que demuestra qué lo causó.**
