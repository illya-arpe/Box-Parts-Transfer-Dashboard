from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HealthRead(BaseModel):
    status: str


class WarehouseCreate(BaseModel):
    name: str
    region: Optional[str] = None


class WarehouseRead(BaseModel):
    id: int
    name: str
    region: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SnapshotCreate(BaseModel):
    warehouse_id: int


class SnapshotRead(BaseModel):
    id: int
    warehouse_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SkuCreate(BaseModel):
    sku_code: str
    product_name: Optional[str] = None
    product_grade: Optional[str] = None


class SkuRead(BaseModel):
    id: int
    sku_code: str
    product_name: Optional[str] = None
    product_grade: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReplenishmentRowCreate(BaseModel):
    snapshot_id: int
    sku_id: int
    main_in_transit: float = 0
    main_warehouse_available: float = 0
    main_planned_in_transit: float = 0
    main_sales_90d: float = 0
    main_daily_avg_90d: float = 0
    box_in_transit: float = 0
    box_overseas_available: float = 0
    box_planned_in_transit: float = 0
    box_sales_90d: float = 0
    box_daily_avg_90d: float = 0
    box_domestic_available: float = 0
    estimated_failure_qty: float = 0
    estimated_demand_qty: float = 0
    calculated_transfer_qty: float = 0
    adjusted_transfer_qty: float = 0
    adjust_note: Optional[str] = None
    alert_level: str = "G"


class ReplenishmentRowRead(BaseModel):
    id: int
    snapshot_id: int
    sku_id: int
    main_in_transit: float
    main_warehouse_available: float
    main_planned_in_transit: float
    main_sales_90d: float
    main_daily_avg_90d: float
    box_in_transit: float
    box_overseas_available: float
    box_planned_in_transit: float
    box_sales_90d: float
    box_daily_avg_90d: float
    box_domestic_available: float
    estimated_failure_qty: float
    estimated_demand_qty: float
    calculated_transfer_qty: float
    adjusted_transfer_qty: float
    adjust_note: Optional[str] = None
    alert_level: str

    model_config = {"from_attributes": True}
