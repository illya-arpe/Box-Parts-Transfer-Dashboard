from dataclasses import dataclass


@dataclass(frozen=True)
class CalculationConfig:
    forecast_days: int = 90
    failure_rate: float = 0.02
    replacement_ratio: float = 0.20


CALCULATION_CONFIG = CalculationConfig()
