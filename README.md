# 黄盒缺货补货看板

一个用于运营上传当期 Excel 后自动生成 SKU 黄盒调拨建议的 Web 看板系统。

## 启动步骤

### 后端（Python 3.11）

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

访问 `http://localhost:8000/api/health` 应返回：`{"status":"ok"}`。

### 前端（Node.js 18+）

```bash
cd frontend
npm install
npm run dev
```

默认打开 `http://localhost:5173`。

## 后续迭代功能（6 步）

1. 项目初始化 + 数据模型 + 常量配置
2. Excel 上传与列名映射 + 示例模板
3. 计算引擎 + 预警分级 + 优先级排序 + 测试
4. 看板主页（多仓库/筛选/搜索/总览卡片）
5. 手动调整 + 导出 Excel
6. 历史快照 + 趋势图 + 对比上一次快照

## 当前已实现接口（进行中）

- `GET /api/health`：健康检查
- `GET /api/snapshots/template-columns`：查看上传必填列名
- `GET /api/snapshots/template`：下载 CSV 示例模板
- `POST /api/snapshots/upload`：上传 Excel 并写入快照
