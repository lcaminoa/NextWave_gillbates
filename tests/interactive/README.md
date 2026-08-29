# Escenarios interactivos de detección

Estos scripts no forman parte del test automático. Sirven para elegir manualmente
dimensiones y severidad, inyectar un incidente sintético y observar qué anomalías y
candidatos produce Stream B.

Ejemplos:

```bash
# Caída provider × country por defecto
uv run python -m tests.interactive.run_scenario

# Escenario normal: no debería detectar anomalías
uv run python -m tests.interactive.run_scenario --normal

# Caso manual de provider × país × banco
uv run python -m tests.interactive.run_scenario \
  --provider stripe --country BR --issuing-bank itau --severity-pp 35
```

El script usa una semilla fija por defecto para que el resultado sea reproducible.
Cambiar `--seed` permite explorar otra realización del ruido sintético.

## Consola interactiva

Para modificar un escenario sin volver a escribir un comando largo cada vez:

```bash
uv run python -m tests.interactive.repl
```

Dentro de la consola:

```text
show
set rate 1200
set severity 35
inject provider=nova_pay country=BR
run
normal
run
help
quit
```

`rate` es la cantidad de transacciones sintéticas por minuto. Para investigar un
segmento más específico, subirlo evita que quede por debajo de `min_volume`.
