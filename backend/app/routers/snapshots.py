from io import BytesIO

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.database import SessionLocal
from app.models import ReplenishmentRow, Sku, Snapshot, Warehouse

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

            sku = session.scalar(select(Sku).where(Sku.sku_code == main_sku))
            if sku is None:
                sku = Sku(
                    sku_code=main_sku,
                    product_grade=str(row["主品商品等级"]).strip() or None,
                )
                session.add(sku)
                session.flush()

            entry = ReplenishmentRow(
                snapshot_id=snapshot.id,
                sku_id=sku.id,
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
                estimated_failure_qty=0,
                estimated_demand_qty=0,
                calculated_transfer_qty=0,
                adjusted_transfer_qty=0,
                alert_level="G",
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
