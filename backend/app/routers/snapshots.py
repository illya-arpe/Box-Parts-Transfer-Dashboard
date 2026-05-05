from io import BytesIO

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.database import SessionLocal
from app.models import ReplenishmentRow, Sku, Snapshot, Warehouse
from app.services.calculator import calculate_replenishment, row_sort_key

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])

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
    "黄盒90天日均销",
    "黄盒国内仓可用量",
]


def to_float(value: object) -> float:
    if pd.isna(value):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


@router.get("/template-columns")
def get_template_columns() -> dict[str, list[str]]:
    return {"required_columns": REQUIRED_COLUMNS}


@router.get("/template")
def download_template() -> StreamingResponse:
    csv_content = (
        "主品SKU,主品在途数量,主品仓库可用量,主品计划在途量,主品90天销量,主品90天日均销,主品商品等级,"
        "黄盒SKU,黄盒在途数量,黄盒海外仓可用量,黄盒计划在途量,黄盒90天销量,黄盒90天日均销,黄盒国内仓可用量\n"
        "MAIN-001,120,300,80,2925,32.5,A,BOX-001,6,15,10,450,5.0,200\n"
        "MAIN-032,40,180,30,1620,18.0,B,BOX-032,12,24,15,300,3.3,150\n"
    )
    return StreamingResponse(
        iter([csv_content.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=yellow_box_template.csv"},
    )


@router.post("/upload")
async def upload_snapshot(
    file: UploadFile = File(...),
    warehouse_name: str = Form(...),
    warehouse_region: str = Form(default=""),
) -> dict[str, object]:
    filename = file.filename or ""
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx / .xls 文件")

    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"Excel 解析失败: {exc}") from exc

    missing_columns = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail={"message": "Excel 缺少必填列", "missing_columns": missing_columns},
        )

    if df.empty:
        raise HTTPException(status_code=400, detail="Excel 无有效数据行")

    with SessionLocal() as session:
        warehouse = session.scalar(
            select(Warehouse).where(Warehouse.name == warehouse_name)
        )
        if warehouse is None:
            warehouse = Warehouse(
                name=warehouse_name,
                region=warehouse_region or None,
            )
            session.add(warehouse)
            session.flush()

        snapshot = Snapshot(warehouse_id=warehouse.id)
        session.add(snapshot)
        session.flush()

        inserted_rows = 0
        for _, row in df.iterrows():
            main_sku = str(row["主品SKU"]).strip()
            if not main_sku or main_sku.lower() == "nan":
                continue

            calc_result = calculate_replenishment(
                main_daily_avg_90d=to_float(row["主品90天日均销"]),
                box_overseas_available=to_float(row["黄盒海外仓可用量"]),
                box_in_transit=to_float(row["黄盒在途数量"]),
                box_domestic_available=to_float(row["黄盒国内仓可用量"]),
            )

            sku = session.scalar(select(Sku).where(Sku.sku_code == main_sku))
            if sku is None:
                sku = Sku(
                    sku_code=main_sku,
                    product_grade=str(row["主品商品等级"]).strip() or None,
                )
                session.add(sku)
                session.flush()

            entry = ReplenishmentRow(
                # Prompt 3: write formula and alert result during ingestion.
                snapshot_id=snapshot.id,
                sku_id=sku.id,
                box_sku=str(row["黄盒SKU"]).strip(),
                main_in_transit=to_float(row["主品在途数量"]),
                main_warehouse_available=to_float(row["主品仓库可用量"]),
                main_planned_in_transit=to_float(row["主品计划在途量"]),
                main_sales_90d=to_float(row["主品90天销量"]),
                main_daily_avg_90d=to_float(row["主品90天日均销"]),
                box_in_transit=to_float(row["黄盒在途数量"]),
                box_overseas_available=to_float(row["黄盒海外仓可用量"]),
                box_planned_in_transit=to_float(row["黄盒计划在途量"]),
                box_sales_90d=to_float(row["黄盒90天销量"]),
                box_daily_avg_90d=to_float(row["黄盒90天日均销"]),
                box_domestic_available=to_float(row["黄盒国内仓可用量"]),
                estimated_failure_qty=calc_result.estimated_failure_qty,
                estimated_demand_qty=calc_result.estimated_demand_qty,
                calculated_transfer_qty=calc_result.calculated_transfer_qty,
                adjusted_transfer_qty=0,
                alert_level=calc_result.alert_level,
            )
            session.add(entry)
            inserted_rows += 1

        if inserted_rows == 0:
            raise HTTPException(status_code=400, detail="未识别到有效主品SKU数据")

        snapshot_id = snapshot.id
        session.commit()

    return {
        "message": "上传成功",
        "warehouse_name": warehouse_name,
        "snapshot_id": snapshot_id,
        "inserted_rows": inserted_rows,
    }


@router.get("/warehouses")
def get_warehouse_overview() -> dict[str, object]:
    with SessionLocal() as session:
        warehouses = session.scalars(select(Warehouse)).all()
        data = []
        for warehouse in warehouses:
            latest_snapshot = session.scalar(
                select(Snapshot)
                .where(Snapshot.warehouse_id == warehouse.id)
                .order_by(Snapshot.created_at.desc())
                .limit(1)
            )
            data.append(
                {
                    "warehouse_id": warehouse.id,
                    "warehouse_name": warehouse.name,
                    "region": warehouse.region,
                    "latest_snapshot_id": latest_snapshot.id if latest_snapshot else None,
                }
            )
        return {"warehouses": data}


@router.get("/warehouse/{warehouse_id}/latest-rows")
def get_latest_snapshot_rows_by_warehouse(warehouse_id: int) -> dict[str, object]:
    with SessionLocal() as session:
        warehouse = session.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise HTTPException(status_code=404, detail="仓库不存在")

        snapshot = session.scalar(
            select(Snapshot)
            .where(Snapshot.warehouse_id == warehouse_id)
            .order_by(Snapshot.created_at.desc())
            .limit(1)
        )
        if snapshot is None:
            return {"warehouse_id": warehouse_id, "snapshot_id": None, "rows": []}
        return get_snapshot_rows(snapshot.id)


@router.get("/{snapshot_id}/rows")
def get_snapshot_rows(snapshot_id: int) -> dict[str, object]:
    with SessionLocal() as session:
        snapshot = session.get(Snapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="快照不存在")

        rows = (
            session.query(ReplenishmentRow, Sku)
            .join(Sku, Sku.id == ReplenishmentRow.sku_id)
            .filter(ReplenishmentRow.snapshot_id == snapshot_id)
            .all()
        )

        sorted_rows = sorted(
            rows,
            key=lambda item: row_sort_key(
                product_grade=item[1].product_grade,
                alert_level=item[0].alert_level,
                transfer_qty=item[0].calculated_transfer_qty,
            ),
        )

        return {
            "snapshot_id": snapshot_id,
            "rows": [
                {
                    "row_id": row.id,
                    "main_sku": sku.sku_code,
                    "box_sku": row.box_sku,
                    "product_grade": sku.product_grade,
                    "box_overseas_available": row.box_overseas_available,
                    "box_in_transit": row.box_in_transit,
                    "estimated_failure_qty": row.estimated_failure_qty,
                    "estimated_demand_qty": row.estimated_demand_qty,
                    "calculated_transfer_qty": row.calculated_transfer_qty,
                    "alert_level": row.alert_level,
                }
                for row, sku in sorted_rows
            ],
        }
