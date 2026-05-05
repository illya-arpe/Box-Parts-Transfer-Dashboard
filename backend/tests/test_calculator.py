import pytest

from app.services.calculator import calculate_replenishment, classify_alert_level, row_sort_key


def test_formula_calculation_result() -> None:
    result = calculate_replenishment(
        main_daily_avg_90d=32.5,
        box_overseas_available=15,
        box_in_transit=6,
        box_domestic_available=200,
    )
    assert result.estimated_failure_qty == pytest.approx(58.5)
    assert result.estimated_demand_qty == pytest.approx(11.7)
    assert result.calculated_transfer_qty == pytest.approx(-9.3)
    assert result.alert_level == "G"


def test_alert_level_red() -> None:
    level = classify_alert_level(
        calculated_transfer_qty=10,
        box_domestic_available=3,
        box_overseas_available=1,
        main_daily_avg_90d=30,
    )
    assert level == "R"


def test_alert_level_orange() -> None:
    level = classify_alert_level(
        calculated_transfer_qty=8,
        box_domestic_available=20,
        box_overseas_available=1,
        main_daily_avg_90d=30,
    )
    assert level == "O"


def test_alert_level_yellow() -> None:
    level = classify_alert_level(
        calculated_transfer_qty=-1,
        box_domestic_available=50,
        box_overseas_available=0.1,
        main_daily_avg_90d=50,
    )
    assert level == "Y"


def test_sort_priority() -> None:
    high = row_sort_key(product_grade="A", alert_level="R", transfer_qty=5)
    low = row_sort_key(product_grade="B", alert_level="O", transfer_qty=99)
    assert high < low
