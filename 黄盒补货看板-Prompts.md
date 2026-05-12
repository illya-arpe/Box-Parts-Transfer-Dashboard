# 黄盒补货看板 - Cursor AI Prompt 集合

> 适用场景：把这些 prompt 按顺序丢给 Cursor，让它逐步生成一个 **React + FastAPI + SQLite** 的黄盒缺货补货监控看板。
> 数据源：运营人员定期上传 Excel/CSV，看板自动算出每个 SKU 是否需要补黄盒、补多少。

---

## 0. 业务背景速览（每次新开 Cursor 会话时建议先贴一遍）

```
我们在做一个【黄盒缺货补货看板】。

业务背景：
- "黄盒"是产品的外箱。海运过程中黄盒可能损坏，但产品本身完好，
  只需要换一个黄盒就能重新上架销售。
- 我们会定期从国内仓调拨一批黄盒到海外仓，用作日常的破损更换。
- 现在依靠人工 Excel 计算，运营希望有一个自动看板：
  上传当期数据 → 自动算出每个 SKU 需要调多少黄盒到海外仓。

核心计算公式（写死，未来可在配置文件调）：
- 未来 90 天发货失败件数 = 主品 90 天日均销 × 2% × 90
- 预估黄盒需求量          = 未来 90 天发货失败件数 × 20%
- 实际黄盒调拨量          = 预估需求量 - 黄盒海外仓可用数量 - 黄盒海外仓在途数量
（计算结果允许运营在看板上手动微调）

技术栈：
- 前端：React + Vite + TypeScript + Ant Design 5 + TanStack Table v8 + ECharts
- 后端：Python 3.11 + FastAPI + SQLAlchemy 2.x + SQLite + pandas + openpyxl
- 项目结构：monorepo，frontend/ 与 backend/ 平级
```

---

## 1. 整体架构图

```mermaid
flowchart LR
    User[运营人员] -->|上传 Excel| FE[React 看板]
    FE -->|REST API| BE[FastAPI 后端]
    BE -->|pandas 解析| Calc[计算引擎]
    Calc -->|公式 + 预警分级| DB[(SQLite 历史快照)]
    BE -->|openpyxl 导出| FE
    FE -->|手动调整 / 筛选 / 导出| User
```

---

## 2. 使用顺序

| # | Prompt 阶段 | 产出物 | 预计 Cursor 一次跑完时间 |
|---|---|---|---|
| 1 | 项目初始化 + 数据模型 | monorepo 骨架、ORM、常量配置 | 5-10 分钟 |
| 2 | Excel 上传与列名映射 | 上传接口 + 示例模板 | 10-15 分钟 |
| 3 | 计算引擎 + 预警分级 + 排序 | services/calculator.py + pytest | 10-15 分钟 |
| 4 | 看板主页（多仓库 / 筛选 / 搜索） | Dashboard 页面 | 15-20 分钟 |
| 5 | 手动调整 + 导出 Excel | 可编辑列 + 导出接口 | 10-15 分钟 |
| 6 | 历史快照 + 趋势图 + 对比 | 历史页 + ECharts 折线 | 15-20 分钟 |

> **使用建议**：每跑完一个 prompt，先 `git commit` 一次，再进入下一个。中间如果 AI 偏离方向，回滚到上一个 commit 比让它"再修一下"更省时间。

---

# Prompt 1 — 项目初始化 + 数据模型 + 常量配置

```
# 角色
你是一名熟悉 React + FastAPI 全栈开发的资深工程师。

# 背景
我要做一个【黄盒缺货补货看板】（业务背景：黄盒=产品外箱，运输破损时需要换箱重新上架；
我们要把国内仓的黄盒按需调拨到海外仓）。这是项目的第一步：搭骨架 + 定义数据模型。

# 本次要做的
1. 在当前目录下创建 monorepo 结构：
   - frontend/        React + Vite + TypeScript + Ant Design 5 + TanStack Table v8 + ECharts
   - backend/         FastAPI + SQLAlchemy 2.x + SQLite + pandas + openpyxl + pytest
   - samples/         （此次先建空目录，留作 Excel 示例存放）
   - README.md        简要说明启动方式（前端 npm run dev、后端 uvicorn app.main:app --reload）

2. 后端 backend/ 内创建以下文件，写出完整可运行代码：
   - app/main.py                FastAPI 入口，启用 CORS（开发期允许 http://localhost:5173），
                                启动时自动建表
   - app/db.py                  SQLAlchemy engine + SessionLocal + Base，使用 sqlite:///./data.db
   - app/config.py              常量集中管理，至少包含：
                                FAILURE_RATE = 0.02
                                REPLACEMENT_RATIO = 0.20
                                FORECAST_DAYS = 90
                                MID_TERM_DAYS = 30   # 用于"关注"等级判断
                                GRADE_PRIORITY = {"A": 3, "B": 2, "C": 1, "D": 0}
   - app/models.py              定义 4 张表：
       Warehouse        (id PK, code 唯一, name, region, created_at)
       Sku              (id PK, sku_code 唯一, product_name, grade)
       Snapshot         (id PK, warehouse_id FK, uploaded_at, source_filename, note)
       ReplenishmentRow (id PK, snapshot_id FK, sku_id FK,
                         # 主品参数
                         main_in_transit, main_available, main_planned_in_transit,
                         main_sales_90d, main_daily_avg_90d,
                         # 黄盒参数
                         box_in_transit, box_overseas_available, box_planned_in_transit,
                         box_sales_90d, box_daily_avg_90d, box_domestic_available,
                         # 计算结果
                         estimated_failure_qty, estimated_demand_qty,
                         calculated_transfer_qty,
                         # 手动调整
                         adjusted_transfer_qty, adjust_note,
                         # 预警
                         alert_level CHAR(1)   # R/O/Y/G
                         )
       所有数量字段使用 Float 类型（避免 Excel 里出现小数时报错），默认 0。
   - app/schemas.py             Pydantic v2 模型，与上面 ORM 一一对应，命名 *Read / *Create
   - app/routers/health.py      GET /api/health 返回 {"status":"ok"}
   - requirements.txt           固定主要依赖版本

3. 前端 frontend/ 用 `npm create vite@latest . -- --template react-ts` 初始化后，
   - 安装 antd、@tanstack/react-table、echarts、echarts-for-react、axios、react-router-dom
   - 在 src/api/client.ts 里创建 axios 实例，baseURL 读 import.meta.env.VITE_API_BASE
     （默认 http://localhost:8000）
   - 在 src/App.tsx 里写一个最简单的 "Hello 黄盒看板" + 调用 /api/health 显示后端状态的页面
     （后续 prompt 会替换它）
   - 在 .env.development 里写 VITE_API_BASE=http://localhost:8000

4. 在根目录写一份 README.md：
   - 项目目标一句话
   - 启动步骤
   - 后续 prompt 会迭代哪些功能（列出 6 步）

# 技术约束
- 后端 Python 版本 3.11，所有依赖在 requirements.txt 写明版本号
- SQLAlchemy 必须用 2.x 风格的声明式映射（Mapped[...] + mapped_column）
- 前端使用 TS strict 模式，组件统一函数式 + Hooks
- 不要引入 Redux / Zustand / Tailwind，状态管理用 React 自带 + TanStack Query（如有数据请求）
- 不要写任何业务计算逻辑（留给 Prompt 3）

# 验收标准
- `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`
  能成功启动，访问 http://localhost:8000/api/health 返回 {"status":"ok"}
- 启动后 data.db 自动生成，所有 4 张表都已创建
- `cd frontend && npm install && npm run dev` 能在 5173 端口跑起来，
  页面顶部显示后端连通状态（绿色✓ 或红色✗）

# 不要做的
- 不要实现 Excel 上传（Prompt 2 做）
- 不要实现任何计算逻辑（Prompt 3 做）
- 不要做登录鉴权
- 不要把数据库换成 PostgreSQL/MySQL
```

---

# Prompt 2 — Excel 上传与列名映射 + 示例模板

```
# 背景
延续上一步搭好的项目骨架。本次实现【上传当期数据 Excel】这个核心入口。
运营人员每周/每月会从 ERP 导出一份汇总表，把这份表上传到看板，触发一次新的"快照"。

# 依赖前置
- 项目骨架已经在 frontend/ 和 backend/ 下搭好
- ORM 已经定义了 Warehouse / Sku / Snapshot / ReplenishmentRow 4 张表
- 还没有任何业务路由

# 本次要做的

## 后端
1. 新建 backend/app/services/excel_parser.py：
   - 写死一份 EXPECTED_COLUMNS 字典（中文列名 → ORM 字段名映射）：
       "主品SKU"          -> sku_code         (字符串，必填)
       "主品名称"          -> product_name     (字符串，可选)
       "主品商品等级"       -> grade            (字符串 A/B/C/D，可选，默认 D)
       "主品在途数量"       -> main_in_transit
       "主品仓库可用量"     -> main_available
       "主品计划在途量"     -> main_planned_in_transit
       "主品90天销量"       -> main_sales_90d
       "主品90天日均销"     -> main_daily_avg_90d
       "黄盒SKU"           -> box_sku_code     (字符串，必填，存到 ReplenishmentRow.box_sku_code，需要新增此字段)
       "黄盒在途数量"       -> box_in_transit
       "黄盒海外仓可用量"   -> box_overseas_available
       "黄盒计划在途量"     -> box_planned_in_transit
       "黄盒90天销量"       -> box_sales_90d
       "黄盒国内仓可用量"   -> box_domestic_available
       (注意：黄盒日均销 需由 黄盒90天销量 / 90 计算得出，存入 box_daily_avg_90d 字段)
   - 提供 parse_excel(file_bytes, warehouse_id) -> List[ReplenishmentRow] 函数：
     * 用 pandas.read_excel 读取（支持 .xlsx 和 .csv）
     * 缺失必填列时抛 HTTPException 400，错误信息列出缺哪些
     * 数值列缺失值用 0 填充，并用 float 转换；非数字直接报错指出哪一行
     * 自动 upsert Sku 表（按 sku_code）

2. 新建 backend/app/routers/snapshots.py：
   - POST /api/warehouses                创建/更新仓库 (body: code, name, region)
   - GET  /api/warehouses                列出所有仓库
   - POST /api/snapshots/upload          表单上传：file (UploadFile) + warehouse_id + note(可选)
       * 调用 excel_parser
       * 创建一条 Snapshot 记录
       * 批量写入 ReplenishmentRow（calculated_transfer_qty 等计算字段先留 None，下一个 prompt 会补）
       * 返回 { snapshot_id, row_count }
   - GET  /api/snapshots                 ?warehouse_id=, 倒序列出快照
   - GET  /api/snapshots/{id}/rows       返回某快照的全部行（含主品、黄盒所有参数）

3. 在 ReplenishmentRow 模型里新增字段 box_sku_code (String, indexed)，迁移逻辑：
   既然还在开发阶段，直接删掉 data.db 让程序重建即可；在 README 里加一行提示。

## 前端
4. 新建 src/pages/UploadPage.tsx：
   - 顶部有一个仓库选择 Select（数据来自 GET /api/warehouses），
     旁边一个"+ 新增仓库"按钮（弹 Modal 让填 code/name/region）
   - 中间是一个 antd Upload.Dragger，限制 .xlsx/.xls/.csv，单文件，5MB 内
   - 备注 Input.TextArea（可选）
   - "开始上传"按钮：调用 /api/snapshots/upload
   - 上传成功后显示 Result：本次共导入 N 行；提供"前往看板"按钮（后续 prompt 接，先占位）

5. 在 App.tsx 里加 react-router-dom：
   - / → 临时跳到 /upload
   - /upload → UploadPage
   - 顶部加 Layout.Header，左侧 Logo "黄盒补货看板"，右侧菜单（Upload / Dashboard / History 占位）

## 示例模板
6. 在 samples/ 下生成一个示例文件 sample_replenishment.xlsx：
   - 含表头（按上面 EXPECTED_COLUMNS 的中文列名顺序）
   - 编 5-8 行假数据，覆盖以下场景：
     * 一个明显需要紧急补货的（日均销高、海外可用量极低）
     * 一个国内仓不够调的（box_domestic_available 很小）
     * 一个不需要补货的（海外可用量充足）
     * 一个商品等级 A 高优先级
   - 在 README 里写明"测试用例可下载 samples/sample_replenishment.xlsx 上传验证"

# 技术约束
- pandas 读 Excel 时务必 dtype 设为 object 后再手工转 float，避免 SKU 被误转成科学计数
- 列名严格匹配，多 1 个空格也算不上，但允许列的顺序任意
- 后端任何错误都返回结构化 JSON：{"detail": "...具体错误..."}
- 前端 axios 拦截器统一捕获错误并 message.error 提示

# 验收标准
- 启动前后端，访问 /upload，先创建一个仓库（如 code=US01, name=美西仓）
- 上传 samples/sample_replenishment.xlsx，能看到"导入 N 行"的成功提示
- 调用 GET /api/snapshots/{id}/rows 能返回全部行数据，所有原始字段已正确写入
- 列名故意写错一个上传，前端弹出"缺少列：XX"的友好错误

# 不要做的
- 不要实现计算逻辑（calculated_transfer_qty 等都先留 None / 0）
- 不要做看板主页（Prompt 4 做）
- 不要做用户/权限
```

---

# Prompt 3 — 计算引擎 + 预警分级 + 优先级排序 + 单元测试

```
# 背景
延续之前两步：项目骨架和 Excel 上传都已经能跑通。本次要把【自动算出每个 SKU 应该调多少黄盒】
这一核心算法实现完整，并补上预警分级和优先级排序。

# 依赖前置
- ReplenishmentRow 表已有所有原始字段，但 estimated_failure_qty / estimated_demand_qty /
  calculated_transfer_qty / alert_level 这几个字段在上传时还是空值
- backend/app/config.py 已有 FAILURE_RATE / REPLACEMENT_RATIO / FORECAST_DAYS / MID_TERM_DAYS / GRADE_PRIORITY

# 本次要做的

## 1. 计算服务
新建 backend/app/services/calculator.py，实现纯函数（不依赖 DB）：

```python
@dataclass
class CalcInput:
    main_daily_avg_90d: float
    box_overseas_available: float
    box_in_transit: float
    box_domestic_available: float
    grade: str          # A/B/C/D
    # 以下为预警判断会用到的辅助参数
    box_planned_in_transit: float
    main_available: float

@dataclass
class CalcResult:
    estimated_failure_qty: float    # 未来 90 天发货失败件数
    estimated_demand_qty: float     # 未来 90 天黄盒预估需求
    calculated_transfer_qty: float  # 计算调拨量（可负，负表示无需调）
    alert_level: str                # "R" / "O" / "Y" / "G"
    priority_score: int             # 用于排序，越大越靠前

def calculate(inp: CalcInput) -> CalcResult: ...
```

公式严格按下方实现：

```
estimated_failure_qty = main_daily_avg_90d * FAILURE_RATE * FORECAST_DAYS
estimated_demand_qty  = estimated_failure_qty * REPLACEMENT_RATIO
calculated_transfer_qty = max(
    estimated_demand_qty - box_overseas_available - box_in_transit,
    0
) 的"是否大于 0"用于预警，但字段值仍存原始差值（允许为负）
```

预警分级 alert_level：
- "R" 紧急：calculated_transfer_qty > 0 且 box_domestic_available < calculated_transfer_qty
  （需要调，但国内仓库存不够，必须先补国内）
- "O" 预警：calculated_transfer_qty > 0 且 box_domestic_available >= calculated_transfer_qty
  （需要调，且国内仓有货，正常发起调拨）
- "Y" 关注：calculated_transfer_qty <= 0 但 box_overseas_available <
  (estimated_demand_qty * MID_TERM_DAYS / FORECAST_DAYS)
  （现在不需要调，但海外可用量已经撑不到 30 天预估需求，提前关注）
- "G" 正常：以上都不是

priority_score 计算（用于看板默认排序）：
- 商品等级映射：GRADE_PRIORITY 中查表，缺失按 0
- 预警映射：R=400, O=300, Y=200, G=100
- 总分 = 预警分 + 等级分*10 + 调拨量截断（用 min(calculated_transfer_qty, 99) 做加分）

## 2. 触发计算
修改 backend/app/routers/snapshots.py：
- 在 POST /api/snapshots/upload 解析完 Excel 之后、commit 之前，
  对每一行调用 calculator.calculate，把 4 个计算结果字段填回 ReplenishmentRow
- 新增 POST /api/snapshots/{id}/recalculate：把已有快照所有行重新算一遍并保存
  （便于改了 config 里的常量后重算历史数据）

## 3. 单元测试
新建 backend/tests/test_calculator.py，至少覆盖以下用例：
- 正常需要补货且国内充足 → "O"
- 需要补货但国内不够 → "R"
- 不需要补货且海外可用充足 → "G"
- 不需要补货但海外可用撑不到 30 天 → "Y"
- daily_avg = 0 时所有计算结果应为 0 且 alert = "G"
- 商品等级 A 与 D 的 priority_score 排序正确
- 边界：calculated_transfer_qty 刚好 = box_domestic_available 的情况（应判 "O"）

跑通 `cd backend && pytest -v` 全绿。

## 4. API 端到端验收
GET /api/snapshots/{id}/rows 返回的每行都要带：
- 全部原始字段
- estimated_failure_qty / estimated_demand_qty / calculated_transfer_qty
- alert_level
- priority_score

# 技术约束
- 计算函数纯函数，不接触 DB；DB 的部分写在 router 里
- 所有 float 计算用 round(x, 2) 处理后再存
- 如果 main_daily_avg_90d 是 None，按 0 处理
- 不要把常量硬编码到 calculator.py，全部从 app.config 读取

# 验收标准
- 跑 pytest 全绿
- 重新上传 samples/sample_replenishment.xlsx，调用 GET /api/snapshots/{id}/rows，
  验证示例数据里"明显紧急的那一行"alert_level = "R"
- 调用 POST /api/snapshots/{id}/recalculate 不报错，行数不变

# 不要做的
- 不要碰前端
- 不要把预警阈值（30 天、20% 等）做成可配置 UI（先放 config.py，后期再改）
- 不要引入额外的库
```

---

# Prompt 4 — 看板主页（多仓库 / 筛选 / 搜索 / 总览卡片）

```
# 背景
后端 API 已经能返回每个 SKU 的完整数据 + 计算结果 + 预警等级。本次专注前端：
搭出运营每天会盯的【看板主页】，能切换仓库、看总览、筛选、搜索、按优先级排序。

# 依赖前置
- 后端有以下接口：
  GET  /api/warehouses
  GET  /api/snapshots?warehouse_id=
  GET  /api/snapshots/{id}/rows
  POST /api/snapshots/{id}/recalculate
- 前端已有 UploadPage、Layout、axios client

# 本次要做的

## 1. 数据获取 hook
新建 src/hooks/useDashboard.ts：
- 入参 { warehouseId, snapshotId? }
- 内部用 useEffect 拉取仓库列表、快照列表（默认取最新一个）、行数据
- 返回 { warehouses, snapshots, currentSnapshot, rows, loading, refetch }

## 2. 主页面 src/pages/DashboardPage.tsx 布局

```
┌─────────────────────────────────────────────────────────────┐
│ [仓库 Tabs: 美西仓 | 美东仓 | 德国仓 ...]    [快照 Select]   │
├─────────────────────────────────────────────────────────────┤
│  [总览卡片区]                                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  [重新计算 btn] │
│  │紧急 12 │ │预警 28 │ │关注  9 │ │正常 51 │                 │
│  └────────┘ └────────┘ └────────┘ └────────┘                 │
├─────────────────────────────────────────────────────────────┤
│  [筛选区: 等级多选 | 预警级别多选 | 搜索 SKU 输入框]          │
├─────────────────────────────────────────────────────────────┤
│  [TanStack Table]                                            │
│   - 列分组：基础信息 / 主品参数 / 黄盒参数 / 计算结果 / 操作  │
│   - 默认按 priority_score 倒序                                │
│   - 调拨量列、预警列冻结在右侧                                │
│   - 紧急行整行淡红色背景，预警行淡橙色，关注行淡黄色          │
└─────────────────────────────────────────────────────────────┘
```

## 3. 表格列定义（按分组）
- 基础信息：主品 SKU、主品名称、商品等级（用 Tag 染色 A 红 / B 橙 / C 绿 / D 灰）
- 主品参数：在途、可用、计划在途、90 天销量、90 天日均销
- 黄盒参数：黄盒 SKU、海外仓可用、海外仓在途、计划在途、国内仓可用、90 天日均销
- 计算结果：未来 90 天预估需求、计算调拨量
- 操作：暂时只放一个"详情"按钮（Modal 显示该行所有字段，便于 debug）
- 预警等级：单独一列固定在最右，用 antd Tag 显示中文（紧急/预警/关注/正常），
  对应颜色 red/orange/gold/green

## 4. 筛选与搜索
- 等级筛选：antd Select multiple，选项 A/B/C/D
- 预警筛选：antd Select multiple，选项 紧急/预警/关注/正常
- SKU 搜索：antd Input.Search，回车或失焦后过滤（同时匹配主品 SKU 和黄盒 SKU）
- 筛选都是【前端内存过滤】，因为单仓库一次最多几千行，不需要走后端

## 5. 总览卡片
- 数字 = 当前过滤前的总数（让运营看完整概况）
- 紧急、预警卡片点击后等同于把对应预警筛选切换上

## 6. 重新计算按钮
- 顶部右侧"重新计算"按钮 → 调用 POST /api/snapshots/{id}/recalculate
  → 成功后 refetch 数据，message.success("重新计算完成")

# 技术约束
- 表格使用 @tanstack/react-table v8 + antd 的 Table 渲染样式（手动接），或者
  直接用 antd Table 也可（你判断哪种更快），关键是要支持列分组表头
- 颜色染色：紧急 #fff1f0 / 预警 #fff7e6 / 关注 #fffbe6 / 正常 不染色
- 路由：/dashboard
- 不要引入额外 UI 库（Material UI、Chakra 等都不要）

# 验收标准
- 上传过 sample 数据后访问 /dashboard，能看到完整表格
- 切换仓库 Tabs 数据正确切换
- 切换到非最新快照，数据相应改变
- 筛选"紧急"+ 搜索某个 SKU 关键词组合生效
- 点击"紧急 12"卡片，预警筛选自动选中"紧急"
- 点击"重新计算"后行数据可能变化（如果改过 config 常量）

# 不要做的
- 不要实现单元格编辑（Prompt 5 做）
- 不要实现导出功能（Prompt 5 做）
- 不要实现历史趋势图（Prompt 6 做）
```

---

# Prompt 5 — 手动调整调拨量 + 导出 Excel

```
# 背景
看板已能自动算出建议调拨量，但运营有时需要根据经验微调（比如把零头抹掉、A 等级商品多调一点）。
本次实现可编辑列 + 调整原因记录 + 一键导出当前视图为 Excel。

# 依赖前置
- DashboardPage 已可用，表格已渲染
- ReplenishmentRow 已有 adjusted_transfer_qty 和 adjust_note 字段，但还没接口可改

# 本次要做的

## 后端
1. 新增 PATCH /api/replenishment-rows/{id}：
   - body: { adjusted_transfer_qty: float, adjust_note?: string }
   - 校验：adjusted_transfer_qty >= 0
   - 返回更新后的整行

2. 新增 POST /api/snapshots/{id}/export：
   - 入参 query：alert_levels=R,O,Y,G&grades=A,B,C,D&keyword=
     （和前端筛选条件一致；服务端按这些过滤）
   - 出参：StreamingResponse 一个 .xlsx 文件
   - 文件名：黄盒调拨清单_{warehouse_code}_{snapshot_uploaded_at:yyyyMMdd_HHmm}.xlsx
   - 列顺序（写在 services/excel_exporter.py 的 EXPORT_COLUMNS 常量里）：
     主品SKU / 主品名称 / 商品等级 / 黄盒SKU /
     主品90天日均销 / 黄盒海外仓可用 / 黄盒海外仓在途 / 黄盒国内仓可用 /
     未来90天预估需求 / 计算调拨量 / 调整后调拨量 / 调整原因 / 预警等级（中文）
   - 对预警等级行使用 openpyxl 的 PatternFill 染色（与前端一致）
   - 表头加粗、冻结首行

## 前端
3. 把 DashboardPage 表格里"计算调拨量"右侧增加一列"调整后调拨量"：
   - 用 antd InputNumber + 双击进入编辑模式（或者直接显示 InputNumber，更简单）
   - 失焦或回车触发 PATCH 接口
   - 保存中本行 loading，保存成功 message.success("已保存")
   - 编辑保存时如果 adjusted_transfer_qty 与 calculated_transfer_qty 差异 >= 30%（或差值 >= 50），
     强制弹一个 Modal 让填"调整原因"（必填）
   - 否则点击右侧"备注"小图标也可编辑原因

4. 顶部增加"导出当前视图"按钮：
   - 调用 POST /api/snapshots/{id}/export，把当前筛选条件作为 query 拼上
   - 浏览器自动下载

5. 把"调整后调拨量"列的渲染做成：
   - 如果 adjusted_transfer_qty 为 null，显示 calculated_transfer_qty 的值，提示文案 "(未调整)"
   - 如果有调整，显示调整值，下方小字 "(原 {calculated_transfer_qty})"

## 类型同步
6. 在 frontend/src/types/replenishment.ts 中维护 ReplenishmentRow 类型，与后端 schemas 对齐。
   后续所有页面共用此类型。

# 技术约束
- 强制填写调整原因的阈值（30% 或 50 件）做成前端常量 ADJUST_REASON_THRESHOLD，写在配置文件里
  （比如 src/config.ts），后续可以改
- 后端导出 Excel 的列顺序、染色规则、文件名格式都集中在一个常量里，方便后续扩展
- 不要在前端做 Excel 拼装（容易格式错乱），统一走后端 openpyxl

# 验收标准
- 编辑某行的调整后调拨量从 100 改到 130（差异 30%）→ 弹原因 Modal → 必填提交 →
  PATCH 成功 → 行下方显示 "(原 100)"
- 改成 110（差异 10%）不弹 Modal，直接保存
- 应用一组筛选后点击"导出当前视图"，下载的 Excel 行数与表格一致，
  紧急行有红色底色，调整后调拨量列显示已编辑过的值

# 不要做的
- 不要实现历史/趋势（Prompt 6 做）
- 不要把 adjust_note 做成富文本，纯字符串即可（最长 200 字）
```

---

# Prompt 6 — 历史快照 + 趋势图 + 与上一次对比

```
# 背景
运营除了看当前，还要做复盘：上一周的调拨建议是什么？某个 SKU 的调拨量趋势如何？
本次预警等级变了哪些？这一步把这些场景做出来。

# 依赖前置
- 已有多个快照（每次上传 Excel 都会生成一个）
- 已有 GET /api/snapshots、GET /api/snapshots/{id}/rows
- DashboardPage 已经支持切换快照查看

# 本次要做的

## 后端
1. 新增 GET /api/snapshots/compare?old=<id>&new=<id>：
   - 同一个仓库的两个快照
   - 返回数组：[{
       sku_code,
       box_sku_code,
       product_name,
       grade,
       old_alert_level,
       new_alert_level,
       old_calculated_transfer_qty,
       new_calculated_transfer_qty,
       diff_pct           // 调拨量变化百分比
     }]
   - 只返回 alert_level 发生变化的 SKU，按"恶化方向"排序（G→Y→O→R 算恶化）

2. 新增 GET /api/skus/{sku_code}/trend?warehouse_id=&limit=12：
   - 取该仓库下最近 N 个快照中包含该 sku 的所有行
   - 返回 [{
       snapshot_id, uploaded_at,
       calculated_transfer_qty,
       adjusted_transfer_qty,
       box_overseas_available,
       main_daily_avg_90d,
       alert_level
     }]
   - 按时间正序

## 前端
3. 新建 src/pages/HistoryPage.tsx，路由 /history：
   - 左侧 Sider：按仓库分组的快照列表（卡片形式：上传时间、备注、行数、紧急数）
   - 右侧主区：
     * 选中一个快照 → 展示该快照的统计概览（4 类预警的数量饼图 + 总览卡片）
     * 提供"与上一次对比"按钮 → 调用 compare 接口 → 弹出 Drawer 显示变化清单
       - 变化类型用 Tag 显示：紧急→正常 是改善（绿）；正常→紧急 是恶化（红）

4. 在 DashboardPage 表格行的"操作"列增加"趋势"按钮：
   - 点击后弹出 Modal，标题"{主品 SKU} 趋势"
   - Modal 里用 ECharts 折线图，3 条线：
     * 计算调拨量
     * 调整后调拨量（虚线）
     * 黄盒海外仓可用量
   - X 轴 = 快照上传时间，Y 轴 = 数量
   - 鼠标悬浮显示当时的 alert_level 中文

5. Layout 顶部菜单的"History"激活，点击跳 /history。

## 视觉小细节
6. 历史快照卡片高度统一，紧急数 > 0 的卡片右上角放一个红色小圆点
7. 折线图配色：调拨量蓝色、调整后调拨量蓝色虚线、海外可用量绿色

# 技术约束
- ECharts 用 echarts-for-react 包装，组件叫 SkuTrendChart
- 不要在前端缓存对比结果（每次点都重新拉，确保数据最新）
- compare 接口要支持快照属于不同时间但同一仓库；跨仓库直接 400

# 验收标准
- 上传至少 3 次 sample 数据（每次稍作改动）后：
  * /history 页能看到 3 个快照，按时间倒序
  * 选中第 2 个，"与上一次对比"能列出 alert 变化的 SKU
  * Dashboard 表格点某行的"趋势"，弹窗里折线有 3 个点连成线

# 不要做的
- 不要做 SKU 维度的多 SKU 对比图（先做单 SKU 即可）
- 不要把历史数据做归档/导出（导出已在 Prompt 5 做过单快照导出）
- 不要实现自动定时刷新（运营手动上传触发即可）
```

---

# 文末：使用建议与常见调整点

## A. 推荐执行节奏
1. 先按顺序跑 Prompt 1 → 2 → 3，跑完一轮就有"上传 → 自动算 → API 返回结果"的最小闭环，
   可以让运营先看到数据正确性
2. Prompt 4 出来后就具备日常使用价值，可以先内部小范围试用一周
3. Prompt 5、6 是体验增强，根据实际反馈再做

## B. 常见想调整的地方（不需要重写 prompt，直接改代码）

| 想改什么 | 改哪个文件 |
|---|---|
| 失败率从 2% 改成 3% | `backend/app/config.py` 的 `FAILURE_RATE` |
| 换箱比例从 20% 改成 25% | `backend/app/config.py` 的 `REPLACEMENT_RATIO` |
| 预测周期改成 60 天 | `backend/app/config.py` 的 `FORECAST_DAYS` |
| "关注"等级阈值改成 45 天 | `backend/app/config.py` 的 `MID_TERM_DAYS` |
| 商品等级权重 | `backend/app/config.py` 的 `GRADE_PRIORITY` |
| 强制填原因的差异阈值 | `frontend/src/config.ts` 的 `ADJUST_REASON_THRESHOLD` |
| Excel 列名 | `backend/app/services/excel_parser.py` 的 `EXPECTED_COLUMNS` |
| 导出列顺序 | `backend/app/services/excel_exporter.py` 的 `EXPORT_COLUMNS` |
| 预警染色 | 前端 DashboardPage 的色值常量 + 后端 excel_exporter 的 PatternFill |

## C. 后续可演进方向（先不做，留给以后）
- 接入 ERP / WMS 实时 API（替代 Excel 上传）
- 加邮件 / 飞书机器人推送：紧急 SKU 自动通知采购
- 加权限：运营只能看本仓库，管理员看全部
- 调拨单一键生成 PDF / 对接 OA 流程
- 多语言（海外团队会用）

## D. 用 Prompt 时的小技巧
- 每个 prompt 跑之前先 `git status` 确认上一步已 commit
- 如果 Cursor 改完后报错，不要马上接着写 prompt 修，而是先把报错原文贴回去让它修
- 看板里出现奇怪数据，第一反应是检查 Excel 列名是否完全匹配（多个空格也算不上）
- 计算结果存疑时，到 `backend/tests/test_calculator.py` 加一个能复现的用例，让 AI 修

---

> 维护人：运营 / 数据团队
> 最后更新：跟随各阶段 Prompt 完成时间记录
