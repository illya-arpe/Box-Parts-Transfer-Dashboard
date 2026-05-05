from datetime import datetime
from typing import Optional

from sqlalchemy import CHAR, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    snapshots: Mapped[list["Snapshot"]] = relationship(back_populates="warehouse")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    warehouse: Mapped["Warehouse"] = relationship(back_populates="snapshots")
    replenishment_rows: Mapped[list["ReplenishmentRow"]] = relationship(
        back_populates="snapshot"
    )


class Sku(Base):
    __tablename__ = "skus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku_code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    product_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    product_grade: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    replenishment_rows: Mapped[list["ReplenishmentRow"]] = relationship(
        back_populates="sku"
    )


class ReplenishmentRow(Base):
    __tablename__ = "replenishment_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id"), index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True)
    box_sku: Mapped[str] = mapped_column(String(100), default="")

    main_in_transit: Mapped[float] = mapped_column(Float, default=0)
    main_warehouse_available: Mapped[float] = mapped_column(Float, default=0)
    main_planned_in_transit: Mapped[float] = mapped_column(Float, default=0)
    main_sales_90d: Mapped[float] = mapped_column(Float, default=0)
    main_daily_avg_90d: Mapped[float] = mapped_column(Float, default=0)

    box_in_transit: Mapped[float] = mapped_column(Float, default=0)
    box_overseas_available: Mapped[float] = mapped_column(Float, default=0)
    box_planned_in_transit: Mapped[float] = mapped_column(Float, default=0)
    box_sales_90d: Mapped[float] = mapped_column(Float, default=0)
    box_daily_avg_90d: Mapped[float] = mapped_column(Float, default=0)
    box_domestic_available: Mapped[float] = mapped_column(Float, default=0)

    estimated_failure_qty: Mapped[float] = mapped_column(Float, default=0)
    estimated_demand_qty: Mapped[float] = mapped_column(Float, default=0)
    calculated_transfer_qty: Mapped[float] = mapped_column(Float, default=0)

    adjusted_transfer_qty: Mapped[float] = mapped_column(Float, default=0)
    adjust_note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    alert_level: Mapped[str] = mapped_column(CHAR(1), default="G")

    snapshot: Mapped["Snapshot"] = relationship(back_populates="replenishment_rows")
    sku: Mapped["Sku"] = relationship(back_populates="replenishment_rows")
