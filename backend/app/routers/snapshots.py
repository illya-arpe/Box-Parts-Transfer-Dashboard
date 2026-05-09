from io import BytesIO
from urllib.parse import quote

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select

from app.database import SessionLocal
from app.models import ReplenishmentRow, Sku, Snapshot, Warehouse
from app.services.calculator import calculate_replenishment, row_sort_key

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])

REQUIRED_COLUMNS = [
    "仓库名",
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


def to_float(value: object) -> float:
    if pd.isna(value):
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def calculate_priority_score(
    alert_level: str,
    product_grade: str | None,
    calculated_transfer_qty: float,
) -> float:
    alert_scores = {"R": 400, "O": 300, "Y": 200, "G": 100}
    grade_scores = {"A": 30, "B": 20, "C": 10, "D": 0}
    normalized_grade = (product_grade or "D").upper()
    alert_score = alert_scores.get(alert_level, 0)
    grade_score = grade_scores.get(normalized_grade, 0)
    qty_score = min(max(calculated_transfer_qty, 0), 99)
    return alert_score + grade_score * 10 + qty_score


def build_rows_payload(rows: list[tuple[ReplenishmentRow, Sku]]) -> list[dict[str, object]]:
    return [
        {
            "row_id": row.id,
            "main_sku": sku.sku_code,
            "box_sku": row.box_sku,
            "product_grade": sku.product_grade,
            # 主品参数
            "main_in_transit": row.main_in_transit,
            "main_available": row.main_warehouse_available,
            "main_planned_in_transit": row.main_planned_in_transit,
            "main_sales_90d": row.main_sales_90d,
            "main_daily_avg_90d": row.main_daily_avg_90d,
            # 黄盒参数
            "box_in_transit": row.box_in_transit,
            "box_overseas_available": row.box_overseas_available,
            "box_planned_in_transit": row.box_planned_in_transit,
            "box_domestic_available": row.box_domestic_available,
            "box_sales_90d": row.box_sales_90d,
            "box_daily_avg_90d": row.box_daily_avg_90d,
            # 计算结果
            "estimated_failure_qty": row.estimated_failure_qty,
            "estimated_demand_qty": row.estimated_demand_qty,
            "calculated_transfer_qty": row.calculated_transfer_qty,
            "priority_score": calculate_priority_score(
                alert_level=row.alert_level,
                product_grade=sku.product_grade,
                calculated_transfer_qty=row.calculated_transfer_qty,
            ),
            # 手动调整
            "adjusted_transfer_qty": row.adjusted_transfer_qty,
            "adjust_note": row.adjust_note,
            # 预警
            "alert_level": row.alert_level,
        }
        for row, sku in rows
    ]


@router.get("/template-columns")
def get_template_columns() -> dict[str, list[str]]:
    return {"required_columns": REQUIRED_COLUMNS}


@router.get("/template")
def download_template() -> StreamingResponse:
    workbook = Workbook()
    ws = workbook.active
    ws.title = "补货数据"

    headers = [
        "仓库名",
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
    ws.append(headers)

    example_row = [
        "泰国仓",
        "MAIN-001",
        120,
        300,
        80,
        2925,
        32.5,
        "A",
        "BOX-001",
        6,
        15,
        10,
        450,
        200,
    ]
    ws.append(example_row)

    for col in ws.columns:
        max_length = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = max(max_length + 4, 14)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = quote("黄盒补货模板.xlsx")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}; filename*=utf-8''{filename}"
        },
    )


@router.post("/upload")
async def upload_snapshot(
    file: UploadFile = File(...),
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

    # 按仓库名分组
    df["仓库名"] = df["仓库名"].fillna("").astype(str).str.strip()
    warehouse_groups = df.groupby("仓库名")

    total_rows = 0
    warehouse_snapshots: dict[str, int] = {}

    with SessionLocal() as session:
        for warehouse_name, group_df in warehouse_groups:
            if not warehouse_name or warehouse_name.lower() == "nan":
                continue

            # 获取或创建仓库
            warehouse = session.scalar(
                select(Warehouse).where(Warehouse.name == warehouse_name)
            )
            if warehouse is None:
                warehouse = Warehouse(name=warehouse_name)
                session.add(warehouse)
                session.flush()

            # 创建快照
            snapshot = Snapshot(warehouse_id=warehouse.id)
            session.add(snapshot)
            session.flush()

            inserted_rows = 0
            for _, row in group_df.iterrows():
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
                    box_domestic_available=to_float(row["黄盒国内仓可用量"]),
                    estimated_failure_qty=calc_result.estimated_failure_qty,
                    estimated_demand_qty=calc_result.estimated_demand_qty,
                    calculated_transfer_qty=calc_result.calculated_transfer_qty,
                    adjusted_transfer_qty=0,
                    alert_level=calc_result.alert_level,
                )
                session.add(entry)
                inserted_rows += 1

            if inserted_rows > 0:
                total_rows += inserted_rows
                warehouse_snapshots[warehouse_name] = snapshot.id

        if total_rows == 0:
            raise HTTPException(status_code=400, detail="未识别到有效数据（请检查仓库名是否填写）")

        session.commit()

    return {
        "message": "上传成功",
        "total_rows": total_rows,
        "warehouses_created": len(warehouse_snapshots),
        "warehouse_snapshots": warehouse_snapshots,
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
                .order_by(Snapshot.id.desc())
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


@router.get("")
def list_snapshots(warehouse_id: int = Query(...)) -> dict[str, object]:
    with SessionLocal() as session:
        rows = (
            session.query(ReplenishmentRow, Sku, Snapshot)
            .join(Snapshot, Snapshot.id == ReplenishmentRow.snapshot_id)
            .join(Sku, Sku.id == ReplenishmentRow.sku_id)
            .filter(Snapshot.warehouse_id == warehouse_id)
            .all()
        )

        snap_stats: dict[int, dict[str, int]] = {}
        for row, sku, snap in rows:
            if snap.id not in snap_stats:
                snap_stats[snap.id] = {
                    "row_count": 0,
                    "alert_r": 0,
                    "alert_o": 0,
                    "alert_y": 0,
                    "alert_g": 0,
                }
            snap_stats[snap.id]["row_count"] += 1
            lvl = row.alert_level
            if lvl == "R":
                snap_stats[snap.id]["alert_r"] += 1
            elif lvl == "O":
                snap_stats[snap.id]["alert_o"] += 1
            elif lvl == "Y":
                snap_stats[snap.id]["alert_y"] += 1
            else:
                snap_stats[snap.id]["alert_g"] += 1

        snap_list = (
            session.scalars(
                select(Snapshot)
                .where(Snapshot.warehouse_id == warehouse_id)
                .order_by(Snapshot.id.desc())
            )
            .all()
        )

        return {
            "warehouse_id": warehouse_id,
            "snapshots": [
                {
                    "id": snap.id,
                    "warehouse_id": snap.warehouse_id,
                    "created_at": snap.created_at.isoformat(),
                    **snap_stats.get(snap.id, {
                        "row_count": 0, "alert_r": 0, "alert_o": 0, "alert_y": 0, "alert_g": 0
                    }),
                }
                for snap in snap_list
            ],
        }


@router.get("/warehouse/{warehouse_id}/latest-rows")
def get_latest_snapshot_rows_by_warehouse(warehouse_id: int) -> dict[str, object]:
    with SessionLocal() as session:
        warehouse = session.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise HTTPException(status_code=404, detail="仓库不存在")

        snapshot = session.scalar(
            select(Snapshot)
            .where(Snapshot.warehouse_id == warehouse_id)
            .order_by(Snapshot.id.desc())
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

        return {"snapshot_id": snapshot_id, "rows": build_rows_payload(sorted_rows)}


@router.patch("/rows/{row_id}/adjust")
def adjust_row(
    row_id: int,
    adjusted_transfer_qty: float = Form(...),
    adjust_note: str = Form(default=""),
) -> dict[str, object]:
    with SessionLocal() as session:
        row = session.get(ReplenishmentRow, row_id)
        if row is None:
            raise HTTPException(status_code=404, detail="行数据不存在")
        row.adjusted_transfer_qty = adjusted_transfer_qty
        row.adjust_note = adjust_note.strip() or None
        session.commit()
        return {
            "message": "调整已保存",
            "row_id": row_id,
            "adjusted_transfer_qty": row.adjusted_transfer_qty,
            "adjust_note": row.adjust_note,
        }


@router.post("/{snapshot_id}/export")
def export_snapshot_rows(
    snapshot_id: int,
    row_ids: str = Form(...),
) -> StreamingResponse:
    selected_ids = [int(x) for x in row_ids.split(",") if x.strip()]
    if not selected_ids:
        raise HTTPException(status_code=400, detail="导出行不能为空")

    with SessionLocal() as session:
        snapshot = session.get(Snapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="快照不存在")
        rows = (
            session.query(ReplenishmentRow, Sku)
            .join(Sku, Sku.id == ReplenishmentRow.sku_id)
            .filter(
                ReplenishmentRow.snapshot_id == snapshot_id,
                ReplenishmentRow.id.in_(selected_ids),
            )
            .all()
        )
        if not rows:
            raise HTTPException(status_code=400, detail="未找到导出数据")

        row_map = {row.id: (row, sku) for row, sku in rows}
        ordered_rows = [row_map[rid] for rid in selected_ids if rid in row_map]

        workbook = Workbook()
        ws = workbook.active
        ws.title = "补货建议"
        ws.append(
            [
                "主品SKU",
                "黄盒SKU",
                "商品等级",
                "黄盒海外仓可用量",
                "黄盒在途数量",
                "预估需求量",
                "计算调拨量",
                "调整后调拨量",
                "调整原因",
                "预警级别",
            ]
        )
        for row, sku in ordered_rows:
            ws.append(
                [
                    sku.sku_code,
                    row.box_sku,
                    sku.product_grade,
                    round(row.box_overseas_available),
                    round(row.box_in_transit),
                    round(row.estimated_demand_qty),
                    round(row.calculated_transfer_qty),
                    round(row.adjusted_transfer_qty) if row.adjusted_transfer_qty else "",
                    row.adjust_note or "",
                    row.alert_level,
                ]
            )

        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        filename = f"snapshot_{snapshot_id}_view.xlsx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )


ALERT_ORDER = {"R": 4, "O": 3, "Y": 2, "G": 1}


def _alert_severity(level: str) -> int:
    return ALERT_ORDER.get(level, 0)


@router.get("/compare")
def compare_snapshots(
    old: int = Query(..., description="旧快照 ID"),
    new: int = Query(..., description="新快照 ID"),
) -> dict[str, object]:
    with SessionLocal() as session:
        old_snap = session.get(Snapshot, old)
        new_snap = session.get(Snapshot, new)
        if old_snap is None:
            raise HTTPException(status_code=404, detail=f"旧快照 {old} 不存在")
        if new_snap is None:
            raise HTTPException(status_code=404, detail=f"新快照 {new} 不存在")
        if old_snap.warehouse_id != new_snap.warehouse_id:
            raise HTTPException(
                status_code=400,
                detail="两个快照必须属于同一仓库，不支持跨仓库对比",
            )

        old_rows = {
            (r.sku_id, r.box_sku): r
            for r, _ in session.query(ReplenishmentRow, Sku)
            .join(Sku, Sku.id == ReplenishmentRow.sku_id)
            .filter(ReplenishmentRow.snapshot_id == old)
            .all()
        }

        new_rows = {
            (r.sku_id, r.box_sku): r
            for r, _ in session.query(ReplenishmentRow, Sku)
            .join(Sku, Sku.id == ReplenishmentRow.sku_id)
            .filter(ReplenishmentRow.snapshot_id == new)
            .all()
        }

        old_skus = {sid: s for s, _ in session.query(Sku, ReplenishmentRow)
                    .filter(ReplenishmentRow.snapshot_id == old)
                    .filter(ReplenishmentRow.sku_id == Sku.id)
                    .all()}
        new_skus = {sid: s for s, _ in session.query(Sku, ReplenishmentRow)
                    .filter(ReplenishmentRow.snapshot_id == new)
                    .filter(ReplenishmentRow.sku_id == Sku.id)
                    .all()}

        changed = []
        for (sku_id, box_sku), old_row in old_rows.items():
            new_row = new_rows.get((sku_id, box_sku))
            if new_row is None:
                continue
            if old_row.alert_level == new_row.alert_level:
                continue

            sku = new_skus.get(sku_id)
            old_sev = _alert_severity(old_row.alert_level)
            new_sev = _alert_severity(new_row.alert_level)
            diff_pct: float | None = None
            if old_row.calculated_transfer_qty != 0:
                diff_pct = round(
                    (new_row.calculated_transfer_qty - old_row.calculated_transfer_qty)
                    / abs(old_row.calculated_transfer_qty)
                    * 100,
                    1,
                )

            changed.append(
                {
                    "sku_code": sku.sku_code if sku else "",
                    "box_sku_code": box_sku,
                    "product_name": sku.product_name if sku else None,
                    "grade": sku.product_grade if sku else None,
                    "old_alert_level": old_row.alert_level,
                    "new_alert_level": new_row.alert_level,
                    "old_calculated_transfer_qty": old_row.calculated_transfer_qty,
                    "new_calculated_transfer_qty": new_row.calculated_transfer_qty,
                    "diff_pct": diff_pct,
                    "improved": new_sev < old_sev,
                }
            )

        changed.sort(
            key=lambda x: (
                -abs(_alert_severity(x["new_alert_level"]) - _alert_severity(x["old_alert_level"])),
                _alert_severity(x["new_alert_level"]),
            )
        )
        return {
            "old_snapshot_id": old,
            "new_snapshot_id": new,
            "warehouse_id": old_snap.warehouse_id,
            "changed_count": len(changed),
            "items": changed,
        }
