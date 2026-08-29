# Consola interactiva del Detection Engine

Esta consola sirve para ensayar manualmente el detector con tráfico sintético. Permite inyectar
un incidente, cambiar volumen y severidad, y observar las anomalías, candidatos RCA y evidencia
que produce el motor.

No modifica datos reales ni ejecuta ninguna recomendación: genera transacciones simuladas desde
cero cada vez que se usa `run`.

## Preparación

Desde la raíz del repositorio, instalar/sincronizar las dependencias una vez:

```bash
uv sync
```

Abrir la consola:

```bash
uv run python -m tests.interactive.repl
```

Al iniciar muestra una configuración similar a:

```text
trafico: 1200 tx/min
duracion: 3 ventanas
severidad: -35 pp
incidente: {'provider': 'nova_pay', 'country': 'BR'}
```

## Comandos

| Comando | Qué hace |
|---|---|
| `show` | Muestra la configuración actual. |
| `run` | Genera historia normal, corre las ventanas configuradas e imprime detección + RCA. |
| `normal` | Desactiva la inyección de caos para probar que no haya falsos positivos. |
| `inject clave=valor ...` | Define las dimensiones afectadas y vuelve a activar el caos. |
| `set rate N` | Cambia el tráfico simulado en transacciones por minuto. |
| `set severity N` | Cambia la degradación de aprobación en puntos porcentuales. |
| `set minutes N` | Cambia cuántas ventanas consecutivas se evalúan. |
| `set seed N` | Cambia la semilla del generador; útil para explorar otro ruido aleatorio. |
| `help` | Muestra el resumen de comandos. |
| `quit` | Sale de la consola. |

Las claves válidas para `inject` son:

```text
provider
country
payment_method
issuing_bank
merchant
```

## Primer ensayo recomendado

Dentro de la consola, pegar:

```text
set rate 1200
set severity 35
inject provider=nova_pay country=BR
run
```

Resultado esperado: las primeras dos ventanas todavía no están confirmadas; en la tercera debe
aparecer una anomalía para `country=BR|provider=nova_pay`, seguida de candidatos RCA y evidencia.
Esto sucede porque el detector exige persistencia de tres ventanas antes de alertar.

## Control sano

Para verificar que el ruido normal no genera alertas:

```text
normal
run
```

Resultado esperado:

```text
Resultado final: sin anomalias confirmadas.
```

## Escenarios útiles

### Incidente más específico: proveedor × país × emisor

```text
set rate 2400
set severity 35
inject provider=stripe country=BR issuing_bank=itau
run
```

Subir el tráfico cuando el segmento es más específico evita que quede por debajo de
`min_volume=20` transacciones por ventana.

### Incidente moderado

```text
set severity 12
set minutes 5
inject provider=adyen country=MX
run
```

Una caída menor puede requerir más ventanas para que el EWMA cruce el umbral de detección.

### Explorar otro patrón de ruido

```text
set seed 99
run
```

La semilla cambia las transacciones generadas, pero el escenario sigue siendo reproducible:
repetir el mismo `seed` produce el mismo resultado.

## Cómo interpretar la salida

```text
ventana 1: 0 confirmadas
ventana 2: 0 confirmadas
ventana 3: 3 confirmadas (...)
```

El número solo incluye anomalías **confirmadas**. Una caída puede existir desde la primera
ventana, pero no se publica hasta cumplir volumen mínimo, intervalo creíble, EWMA y persistencia.

Después se imprime el candidato RCA principal:

```text
{'provider': 'nova_pay', 'country': 'BR'} |
score=0.71 | confianza=78% | USD 329701/h
```

- `score`: prioridad RCA, combina impacto, cobertura, confianza y especificidad. No es lo mismo
  que confianza.
- `confianza`: fuerza estadística del candidato, entre 0 y 100 %.
- `USD .../h`: estimación de ingresos perdidos por hora.
- `Evidencias generadas`: datos concretos que después el Investigador OpenAI debe citar.

## Antes de subir cambios

Ejecutar los tests de regresión:

```bash
uv run python -m unittest discover -s tests/detection -v
```

Los escenarios interactivos complementan estos tests, pero no los reemplazan: sirven para probar
casos nuevos, calibrar parámetros y ensayar la demo a ciegas.
