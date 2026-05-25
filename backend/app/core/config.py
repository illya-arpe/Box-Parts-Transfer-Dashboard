from dataclasses import dataclass


@dataclass(frozen=True)
class CalculationConfig:
    forecast_days: int = 90
    failure_rate: float = 0.02
    replacement_ratio: float = 0.20


CALCULATION_CONFIG = CalculationConfig()

REQUIRED_COLUMNS = [
    "主品SKU",
    "主品在途数量",
    "主品仓库可用量",
    "主品计划在途量",
    "主品90天销量",
    "主品90天日均销",
    "主品商品等级",
    "黄盒SKU",
    "黄盒在途数量",
    "黄盒海外仓可用量",
    "黄盒计划在途量",
    "黄盒90天销量",
    "黄盒国内仓可用量",
]
