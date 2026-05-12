---
name: yellow-box-prompts
overview: 设计一份分阶段的 Cursor AI prompt 文档，按 6 个递进步骤生成「黄盒缺货补货看板」Web 系统（React + FastAPI + SQLite，Excel 上传驱动）。
todos:
  - id: draft_md
    content: 创建 `黄盒补货看板-Prompts.md`，写入总体说明、架构图、使用顺序
    status: completed
  - id: prompt_1
    content: 编写 Prompt 1：项目初始化 + ORM 数据模型 + 常量配置
    status: completed
  - id: prompt_2
    content: 编写 Prompt 2：Excel 上传与列名映射 + 示例模板
    status: completed
  - id: prompt_3
    content: 编写 Prompt 3：计算引擎 + 预警分级 + 优先级排序 + pytest
    status: completed
  - id: prompt_4
    content: 编写 Prompt 4：看板主页（多仓库/筛选/搜索/总览卡片）
    status: completed
  - id: prompt_5
    content: 编写 Prompt 5：手动调整单元格 + 导出 Excel
    status: completed
  - id: prompt_6
    content: 编写 Prompt 6：历史快照 + 趋势图 + 对比上一次
    status: completed
  - id: review_section
    content: 文末附上使用建议、常见调整点（参数阈值、添加字段等）
    status: completed
isProject: false
---

# 黄盒补货看板 - Cursor Prompt 设计

## 交付物

一份 markdown 文件 `黄盒补货看板-Prompts.md`，包含 6 个**按顺序使用**的 prompt。每个 prompt 都自带上下文、产出要求、验收标准，直接复制到 Cursor 即可。

## 整体架构（写进 prompt 1 给 AI 作为基线）

```mermaid
flowchart LR
    User[运营人员] -->|上传 Excel| FE[React 看板]
    FE -->|REST API| BE[FastAPI 后端]
    BE -->|pandas 解析| Calc[计算引擎]
    Calc -->|公式+预警| DB[(SQLite 历史快照)]
    BE -->|openpyxl 导出| FE
    FE -->|手动调整/筛选/导出| User
```

**目录结构**：
- `frontend/`：React + Vite + TS + Ant Design + TanStack Table + ECharts
- `backend/`：FastAPI + pandas + openpyxl + SQLAlchemy + SQLite
- `samples/`：示例 Excel 模板（含列名映射）

## 6 个 Prompt 的拆分思路与要点

### Prompt 1 - 项目初始化与数据模型
- 让 AI 搭出 monorepo 骨架（`frontend/` + `backend/`）
- **关键**：定义清楚 ORM 模型，作为后续所有 prompt 的"事实来源"
  - `Warehouse`（海外仓 id/名称/地区）
  - `Sku`（sku、商品名、商品等级）
  - `Snapshot`（一次上传 = 一个快照，含时间戳、仓库 id）
  - `ReplenishmentRow`（snapshot_id + sku + 全部参数 + 计算结果 + 手动调整值 + 预警等级）
- 给出常量配置文件（`FAILURE_RATE = 0.02`、`REPLACEMENT_RATIO = 0.20`，方便后续调）

### Prompt 2 - Excel 上传与列映射
- 前端：拖拽上传组件 + 仓库选择
- 后端：`POST /api/snapshots/upload`，pandas 解析
- **关键**：列名校验。要写死一份"Excel 模板列定义"放在 prompt 里，让 AI 严格按这个列名去解析（避免后期数据接不上）：
  - 主品：`主品SKU`、`主品在途数量`、`主品仓库可用量`、`主品计划在途量`、`主品90天销量`、`主品90天日均销`、`主品商品等级`
  - 黄盒：`黄盒SKU`、`黄盒在途数量`、`黄盒海外仓可用量`、`黄盒计划在途量`、`黄盒90天销量`、`黄盒国内仓可用量`
- 同时让 AI 生成一份示例 Excel 放到 `samples/` 下

### Prompt 3 - 计算引擎 + 预警分级
- **核心公式**（按你给的，原样写死）：
  ```
  未来90天发货失败件数 = 主品90天日均销 × 0.02 × 90
  预估黄盒需求量      = 未来90天发货失败件数 × 0.20
  实际黄盒调拨量      = 预估需求量 - 黄盒海外仓可用量 - 黄盒在途数量
  ```
- **预警分级逻辑**（用到剩余参数，写进 prompt）：
  - `紧急（红）`：调拨量 > 0 **且** 黄盒国内仓可用量 < 调拨量（调不出来）
  - `预警（橙）`：调拨量 > 0 **且** 国内可用充足
  - `关注（黄）`：调拨量 ≤ 0 但黄盒海外仓可用量 < 未来 30 天预估需求
  - `正常（绿）`：其余
- **优先级排序**：商品等级（A>B>C）→ 预警级别 → 调拨量降序
- 单元测试：把公式用 pytest 跑一遍样例数据

### Prompt 4 - 看板主页（多仓库 + 筛选 + 搜索）
- 顶部：海外仓 Tab 切换（多仓库监控）+ 总览卡片（紧急/预警/关注/正常 各多少 SKU）
- 主体：TanStack Table，列分组（主品参数 / 黄盒参数 / 计算结果 / 操作）
- 预警等级用 Ant Design `Tag` 染色
- 筛选：仓库、商品等级、预警级别（多选）
- 搜索：主品 SKU / 黄盒 SKU 模糊匹配
- **关键**：让 AI 把"调拨量"列和"等级"列做成可排序+冻结右侧

### Prompt 5 - 手动调整 + 导出 Excel
- 表格里"实际调拨量（调整后）"列改成可编辑（双击进入），失焦自动保存
- 调整时弹一个小输入框记录"调整原因"（可选），存到 `ReplenishmentRow.adjust_note`
- 顶部按钮"导出当前视图"：把当前筛选+排序后的数据用 openpyxl 导出，列与原 Excel 对齐 + 增加 4 列（预估需求、计算调拨量、调整后调拨量、调整原因）
- 导出文件名带仓库和时间戳

### Prompt 6 - 历史快照 + 趋势查看
- 侧边栏"历史快照"列表：按仓库分组，倒序展示
- 点击某条快照 → 看板切换为只读模式展示当时的数据
- 单 SKU 维度的趋势图（ECharts 折线）：选中某 SKU 后弹窗显示其在不同快照下的「调拨量、海外可用量、日均销」3 条曲线
- 提供"对比上一次快照"功能：高亮显示哪些 SKU 的预警等级发生了变化

## Prompt 编写风格统一约定

每个 prompt 都按这个结构写，便于 Cursor 理解：

1. **背景**：一句话业务背景 + 当前迭代目标
2. **依赖前置**：上一步已经完成了什么（保证 AI 不会重写）
3. **本次要做的**：具体功能点列表
4. **技术约束**：库选择、文件路径、命名规范
5. **验收标准**：可以怎么验证，最好附测试用例或测试步骤
6. **不要做的**：明确边界，避免 AI 过度发挥

## 一处需要你后续补充的地方

`samples/` 下的示例 Excel 模板，最好你提供 1-2 行真实脱敏数据，我会在 prompt 2 里把这个数据示例直接贴进去，AI 解析就更稳。如果暂时没有，我会用编造数据做演示。
