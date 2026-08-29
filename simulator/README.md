# Simulador (Stream A)

Este módulo genera `Transaction` sintéticas y aplica uno o varios `ChaosSpec`. No abre una API
ni importa el detector: Valen lo consume desde FastAPI y Lauti recibe las transacciones resultantes.

```python
from datetime import datetime, timezone

from contracts.schemas import Dimensions
from simulator import PaymentSimulator

simulator = PaymentSimulator(seed=42)
start = datetime.now(timezone.utc)
simulator.chaos.inject_manual(
    Dimensions(provider="nova_pay", country="BR"),
    severity_pp=35,
    started_at=start,
)
batch = simulator.generate(start, count=1_200, interval_seconds=0.05)
```

Interfaz para la API:

- `simulator.chaos.inject(spec)`: registra el `ChaosSpec` que recibió el endpoint manual.
- `simulator.chaos.inject_random(...)`: crea y guarda un incidente `random_unknown`.
- `simulator.chaos.public_spec()`: vista para UI/API; oculta `dimensions` mientras el random no
  haya sido revelado.
- `simulator.chaos.reveal()`: revela el último incidente y devuelve su `ChaosSpec` completo.
- `simulator.stream(start, count=None, interval_seconds=...)`: iterador de eventos. Con
  `count=None` no termina.

`severity_pp` acepta tanto `35` como `-35`; ambos significan una caída de 35 puntos porcentuales.
Esto mantiene compatibilidad con el mock existente y con la descripción del contrato.

Los caos aleatorios eligen segmentos de una a tres dimensiones, no el cruce completo de todas
ellas. Así siguen teniendo volumen suficiente para que el detector los pueda confirmar durante
la demo.
