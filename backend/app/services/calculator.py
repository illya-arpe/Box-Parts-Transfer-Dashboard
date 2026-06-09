from dataclasses import dataclass
from typing import Literal

from app.core.config import CALCULATION_CONFIG

AlertLevel = Literal["R", "O", "Y", "G"]

GRADE_PRIORITY = {
    "0_P0": 0, "1_P1": 1, "2_新品": 2, "3_营销品": 3,
    "4_清仓": 4, "5_停用": 5, "6_维修配件": 6, "7_特价品": 7,
    "8_开发中": 8, "9_非商用品": 9, "10000_暂未销售": 10,
}
ALERT_PRIORITY = {"R": 0, "O": 1, "Y": 2, "G": 3}


@dataclass(frozen=True)
class CalculationResult:
    estimated_failure_qty: float
    estimated_demand_qty: float
    calculated_transfer_qty: float
    alert_level: AlertLevel


def calculate_replenishment(
    main_daily_avg_90d: float,
    box_overseas_available: float,
    box_in_transit: float,
    box_domestic_available: float,
) -> CalculationResult:
    estimated_failure_qty = (
        main_daily_avg_90d
        * CALCULATION_CONFIG.failure_rate
        * CALCULATION_CONFIG.forecast_days
    )
    estimated_demand_qty = estimated_failure_qty * CALCULATION_CONFIG.replacement_ratio
    calculated_transfer_qty = (
        estimated_demand_qty - box_overseas_available - box_in_transit
    )

    alert_level = classify_alert_level(
        calculated_transfer_qty=calculated_transfer_qty,
        box_domestic_available=box_domestic_available,
        box_overseas_available=box_overseas_available,
        main_daily_avg_90d=main_daily_avg_90d,
    )

    return CalculationResult(
        estimated_failure_qty=estimated_failure_qty,
        estimated_demand_qty=estimated_demand_qty,
        calculated_transfer_qty=calculated_transfer_qty,
        alert_level=alert_level,
    )


def classify_alert_level(
    calculated_transfer_qty: float,
    box_domestic_available: float,
    box_overseas_available: float,
    main_daily_avg_90d: float,
) -> AlertLevel:
    if calculated_transfer_qty > 0 and box_domestic_available < calculated_transfer_qty:
        return "R"
    if calculated_transfer_qty > 0 and box_domestic_available >= calculated_transfer_qty:
        return "O"

    estimated_30d_demand = (
        main_daily_avg_90d * CALCULATION_CONFIG.failure_rate * 30
    ) * CALCULATION_CONFIG.replacement_ratio
    if calculated_transfer_qty <= 0 and box_overseas_available < estimated_30d_demand:
        return "Y"
    return "G"


def row_sort_key(product_grade: str | None, alert_level: str, transfer_qty: float) -> tuple:
    normalized_grade = (product_grade or "10000_暂未销售")
    return (
        GRADE_PRIORITY.get(normalized_grade, 99),
        ALERT_PRIORITY.get(alert_level, 99),
        -transfer_qty,
    )
