from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.database import SessionLocal
from app.models import ReplenishmentRow, Sku, Snapshot, Warehouse
from app.services.calculator import row_sort_key

router = APIRouter(prefix="/api/skus", tags=["skus"])


ALERT_ORDER = {"R": 4, "O": 3, "Y": 2, "G": 1}


def _alert_severity(level: str) -> int:
    return ALERT_ORDER.get(level, 0)


@router.get("/{sku_code}/trend")
def get_sku_trend(
    sku_code: str,
    warehouse_name: str = Query(..., description="仓库名称"),
    limit: int = Query(default=12, ge=1, le=100),
) -> dict[str, object]:
    with SessionLocal() as session:
        warehouse = session.scalar(select(Warehouse).where(Warehouse.name == warehouse_name))
        if warehouse is None:
            return {"sku_code": sku_code, "warehouse_name": warehouse_name, "points": []}

        snapshot_ids = [
            row[0]
            for row in session.execute(
                select(Snapshot.id)
                .where(Snapshot.warehouse_id == warehouse.id)
                .order_by(Snapshot.created_at.desc())
                .limit(limit)
            ).all()
        ]
        if not snapshot_ids:
            return {"sku_code": sku_code, "warehouse_name": warehouse_name, "points": []}

        sku = session.scalar(select(Sku).where(Sku.sku_code == sku_code))
        if sku is None:
            raise HTTPException(status_code=404, detail=f"SKU {sku_code} 不存在")

        rows = (
            session.query(ReplenishmentRow, Snapshot)
            .join(Snapshot, Snapshot.id == ReplenishmentRow.snapshot_id)
            .filter(
                ReplenishmentRow.snapshot_id.in_(snapshot_ids),
                ReplenishmentRow.sku_id == sku.id,
            )
            .all()
        )

        points = [
            {
                "snapshot_id": snap.id,
                "uploaded_at": snap.created_at.isoformat(),
                "calculated_transfer_qty": row.calculated_transfer_qty,
                "adjusted_transfer_qty": row.adjusted_transfer_qty,
                "box_overseas_available": row.box_overseas_available,
                "main_daily_avg_90d": row.main_daily_avg_90d,
                "alert_level": row.alert_level,
            }
            for row, snap in rows
        ]
        points.sort(key=lambda p: p["uploaded_at"])
        return {"sku_code": sku_code, "warehouse_name": warehouse_name, "points": points}
