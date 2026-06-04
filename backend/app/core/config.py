from dataclasses import dataclass

COUNTRIES = ["TH", "VN", "SG", "MY", "ID", "PH"]

WAREHOUSES = [
    "泰国主仓-AP",
    "越南胡志明京东仓",
    "新加坡百世仓",
    "马来京东仓",
    "新印尼Flash本地仓",
    "菲律宾C仓",
]


@dataclass(frozen=True)
class CalculationConfig:
    forecast_days: int = 90
    failure_rate: float = 0.02
    replacement_ratio: float = 0.20


CALCULATION_CONFIG = CalculationConfig()

REQUIRED_COLUMNS = [
    "國家",
    "倉庫名",
    "主品SKU",
    "主品在途數量",
    "主品倉庫可用量",
    "主品計劃在途量",
    "主品90天銷量",
    "主品90天日均銷",
    "主品商品等級",
    "黃盒SKU",
    "黃盒在途數量",
    "黃盒海外倉可用量",
    "黃盒計劃在途量",
    "黃盒90天銷量",
    "黃盒國內倉可用量",
]
