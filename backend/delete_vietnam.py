from app.database import SessionLocal
from app.models import Warehouse, Snapshot, ReplenishmentRow

db = SessionLocal()
try:
    # 删除越南仓及其相关数据
    warehouse = db.query(Warehouse).filter(Warehouse.name == '越南仓').first()
    if warehouse:
        print(f'找到越南仓 ID: {warehouse.id}')
        # 删除相关的快照和行数据
        snapshots = db.query(Snapshot).filter(Snapshot.warehouse_id == warehouse.id).all()
        for snap in snapshots:
            db.query(ReplenishmentRow).filter(ReplenishmentRow.snapshot_id == snap.id).delete()
            db.delete(snap)
        db.delete(warehouse)
        db.commit()
        print('越南仓已删除')
    else:
        print('未找到越南仓')
    
    # 显示剩余仓库
    warehouses = db.query(Warehouse).all()
    print(f'当前仓库: {[w.name for w in warehouses]}')
finally:
    db.close()
