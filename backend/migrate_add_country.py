import sqlite3

conn = sqlite3.connect("backend/data.db")
cur = conn.cursor()

# Check if columns already exist
cur.execute("PRAGMA table_info(replenishment_rows)")
cols = [r[1] for r in cur.fetchall()]
print("现有列:", cols)

if "country" not in cols:
    cur.execute('ALTER TABLE replenishment_rows ADD COLUMN country TEXT DEFAULT ""')
    print("已添加 country 列")

if "warehouse_name" not in cols:
    cur.execute('ALTER TABLE replenishment_rows ADD COLUMN warehouse_name TEXT DEFAULT ""')
    print("已添加 warehouse_name 列")

conn.commit()

# Verify
cur.execute("PRAGMA table_info(replenishment_rows)")
cols = [r[1] for r in cur.fetchall()]
print("更新后列:", cols)
conn.close()
print("完成")
