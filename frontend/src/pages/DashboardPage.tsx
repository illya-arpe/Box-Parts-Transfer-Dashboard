import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Tag,
  Tabs,
  Table,
  Input,
  Typography,
  Form,
  message,
  Tooltip,
  Popover,
} from "antd";
import { DownloadOutlined, LineChartOutlined, CloudServerOutlined, QuestionCircleOutlined } from "@ant-design/icons";

import { apiClient } from "../api/client";

type SheetState = {
  snapshot_id: number;
  inserted_rows: number;
  warehouse_name: string;
  message: string;
} | null;

type WarehouseOverview = {
  warehouse_id: number;
  warehouse_name: string;
  region: string | null;
  latest_snapshot_id: number | null;
};

type SnapshotRow = {
  row_id: number;
  main_sku: string;
  box_sku: string;
  product_grade: string | null;
  country: string;
  warehouse_name: string;
  // 主品参数
  main_in_transit: number;
  main_available: number;
  main_planned_in_transit: number;
  main_sales_90d: number;
  main_daily_avg_90d: number;
  // 黄盒参数
  box_in_transit: number;
  box_overseas_available: number;
  box_planned_in_transit: number;
  box_sales_90d: number;
  box_daily_avg_90d: number;
  box_domestic_available: number;
  // 计算结果
  estimated_failure_qty: number;
  estimated_demand_qty: number;
  calculated_transfer_qty: number;
  priority_score: number;
  // 手动调整
  adjusted_transfer_qty: number;
  adjust_note?: string | null;
  // 预警
  alert_level: "R" | "O" | "Y" | "G";
};

type TrendPoint = {
  snapshot_id: number;
  uploaded_at: string;
  calculated_transfer_qty: number;
  adjusted_transfer_qty: number;
  box_overseas_available: number;
  main_daily_avg_90d: number;
  alert_level: "R" | "O" | "Y" | "G";
};

// 公式说明
const FORMULA_POPOVER_CONTENT = (
  <div style={{ maxWidth: 360, fontSize: 12, lineHeight: 1.8 }}>
    <div style={{ fontWeight: 600, marginBottom: 8, color: "#1e293b" }}>计算公式</div>
    <div style={{ marginBottom: 6, color: "#64748b" }}>发货失败率=2%</div>
    <div style={{ marginBottom: 6, color: "#64748b" }}>换黄盒比例=20%</div>
    <div style={{ marginBottom: 6, color: "#64748b" }}>预估未来90天发货失败件数 = 主品90天日均销 × 发货失败率 × 天数（90）</div>
    <div style={{ marginBottom: 6, color: "#64748b" }}>预估未来90天黄盒需求 = 未来90天发货失败件数 × 20%</div>
    <div style={{ marginBottom: 6, color: "#64748b" }}>调拨量 = 预估需求量 - 海外仓可用量 - 海外仓在途量</div>
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0", fontWeight: 600, marginBottom: 8, color: "#1e293b" }}>预警等级说明</div>
    <div style={{ marginBottom: 4, color: "#ef4444" }}><strong>R 紧急</strong>：调拨量&gt;0 且 国内仓可用 &lt; 调拨量 → 库存不足，需立即调拨</div>
    <div style={{ marginBottom: 4, color: "#f97316" }}><strong>O 预警</strong>：调拨量&gt;0 且 国内仓可用 ≥ 调拨量 → 需调拨，库存暂时够用</div>
    <div style={{ marginBottom: 4, color: "#eab308" }}><strong>Y 关注</strong>：调拨量≤0 且 海外仓可用 &lt; 30天预估需求 → 海外仓库存偏少</div>
    <div style={{ color: "#22c55e" }}><strong>G 正常</strong>：其他情况 → 库存充足</div>
  </div>
);

const PRIORITY_POPOVER_CONTENT = (
  <div style={{ maxWidth: 300, fontSize: 12, lineHeight: 1.8 }}>
    <div style={{ fontWeight: 600, marginBottom: 6, color: "#1e293b" }}>优先级分数</div>
    <div style={{ color: "#64748b", marginBottom: 4 }}>总分 = 预警分 + 等级分×10 + min(调拨量, 99)</div>
    <div style={{ marginBottom: 4 }}>预警分：<span style={{ color: "#ef4444" }}>R=400</span>, <span style={{ color: "#f97316" }}>O=300</span>, <span style={{ color: "#eab308" }}>Y=200</span>, <span style={{ color: "#22c55e" }}>G=100</span></div>
    <div>等级分：<span style={{ color: "#a855f7" }}>A=30</span>, <span style={{ color: "#3b82f6" }}>B=20</span>, <span style={{ color: "#64748b" }}>C=10</span>, D=0</div>
  </div>
);

export default function DashboardPage() {
  const [sheetResult, setSheetResult] = useState<SheetState>(null);
  const [loading, setLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseOverview[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [alertFilter, setAlertFilter] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState<string[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonRow, setReasonRow] = useState<SnapshotRow | null>(null);
  const [reasonForm] = Form.useForm<{ adjust_note: string }>();
  const [trendModalOpen, setTrendModalOpen] = useState(false);
  const [trendSku, setTrendSku] = useState<string | null>(null);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const fetchWarehouses = async () => {
    try {
      const response = await apiClient.get<{ warehouses: WarehouseOverview[] }>(
        "/api/snapshots/warehouses"
      );
      setWarehouses(response.data.warehouses);
      if (response.data.warehouses.length > 0 && activeWarehouseId === null) {
        setActiveWarehouseId(response.data.warehouses[0].warehouse_id);
      }
    } catch {
      message.error("仓库列表加载失败");
    }
  };

  const fetchRows = async (warehouseId: number) => {
    setLoadingRows(true);
    try {
      const response = await apiClient.get<{ rows: SnapshotRow[] }>(
        `/api/snapshots/warehouse/${warehouseId}/latest-rows`
      );
      const rowsData = response.data.rows || [];
      setRows(rowsData);
      setActiveSnapshotId((response.data as { snapshot_id?: number }).snapshot_id || null);
      // 从数据中提取可用的国家和仓库选项
      const countries = [...new Set(rowsData.map((r: SnapshotRow) => r.country).filter(Boolean))];
      const warehouses = [...new Set(rowsData.map((r: SnapshotRow) => r.warehouse_name).filter(Boolean))];
      setAvailableCountries(countries);
      setAvailableWarehouses(warehouses);
    } catch {
      message.error("看板数据加载失败");
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses();
  }, []);

  useEffect(() => {
    if (activeWarehouseId !== null) {
      void fetchRows(activeWarehouseId);
    }
  }, [activeWarehouseId]);

  const activeWarehouseName =
    warehouses.find((w) => w.warehouse_id === activeWarehouseId)?.warehouse_name || "美国仓";

  const readFromSheet = async () => {
    if (!sheetUrl.trim()) {
      message.warning("请输入 Google Sheets 链接");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("sheet_url", sheetUrl.trim());
    formData.append("warehouse_name", activeWarehouseName);
    formData.append("warehouse_region", "NA");
    try {
      const response = await apiClient.post<SheetState>("/api/snapshots/from-sheet", formData);
      setSheetResult(response.data);
      message.success("从 Google Sheets 读取成功");
      await fetchWarehouses();
      if (activeWarehouseId !== null) {
        await fetchRows(activeWarehouseId);
      }
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { detail?: { message?: string } | string } };
      };
      const serverMessage =
        (typeof err.response?.data?.detail === "object" &&
          err.response?.data?.detail?.message) ||
        err.response?.data?.detail ||
        "读取失败，请检查表格链接和权限设置";
      message.error(String(serverMessage));
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = rows.filter((row) => {
    const passGrade =
      gradeFilter.length === 0 ||
      gradeFilter.includes((row.product_grade || "").toUpperCase());
    const passAlert =
      alertFilter.length === 0 || alertFilter.includes(row.alert_level);
    const passCountry =
      countryFilter.length === 0 || countryFilter.includes(row.country);
    const passWarehouse =
      warehouseFilter.length === 0 || warehouseFilter.includes(row.warehouse_name);
    const key = keyword.trim().toLowerCase();
    const passKeyword =
      key.length === 0 ||
      row.main_sku.toLowerCase().includes(key) ||
      row.box_sku.toLowerCase().includes(key);
    return passGrade && passAlert && passCountry && passWarehouse && passKeyword;
  });

  const summary = filteredRows.reduce(
    (acc, row) => {
      acc[row.alert_level] += 1;
      return acc;
    },
    { R: 0, O: 0, Y: 0, G: 0 }
  );

  const saveAdjustment = async (record: SnapshotRow, qty: number, note: string) => {
    const formData = new FormData();
    formData.append("adjusted_transfer_qty", String(qty));
    formData.append("adjust_note", note);
    try {
      await apiClient.patch(`/api/snapshots/rows/${record.row_id}/adjust`, formData);
      setRows((prev) =>
        prev.map((x) =>
          x.row_id === record.row_id
            ? { ...x, adjusted_transfer_qty: qty, adjust_note: note }
            : x
        )
      );
      message.success("调整已保存");
    } catch {
      message.error("保存失败");
    } finally {
      setEditingRowId(null);
    }
  };

  const exportCurrentView = async () => {
    if (!activeSnapshotId || filteredRows.length === 0) {
      message.warning("当前无可导出的数据");
      return;
    }
    const formData = new FormData();
    formData.append("row_ids", filteredRows.map((x) => x.row_id).join(","));
    try {
      const response = await apiClient.post(
        `/api/snapshots/${activeSnapshotId}/export`,
        formData,
        { responseType: "blob" }
      );
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `warehouse_${activeWarehouseName}_snapshot_${activeSnapshotId}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success("导出成功");
    } catch {
      message.error("导出失败");
    }
  };

  const handleTrend = async (skuCode: string, warehouseId: number) => {
    setTrendSku(skuCode);
    setTrendModalOpen(true);
    setTrendLoading(true);
    setTrendPoints([]);
    try {
      const r = await apiClient.get<{ points: TrendPoint[] }>(
        `/api/skus/${encodeURIComponent(skuCode)}/trend?warehouse_id=${warehouseId}&limit=12`
      );
      setTrendPoints(r.data.points);
    } catch {
      message.error("趋势数据加载失败");
    } finally {
      setTrendLoading(false);
    }
  };

  const alertTag = (level: SnapshotRow["alert_level"]) => {
    const map: Record<string, React.ReactNode> = {
      R: <Tag color="error">R 紧急</Tag>,
      O: <Tag color="warning">O 预警</Tag>,
      Y: <Tag color="gold">Y 关注</Tag>,
      G: <Tag color="success">G 正常</Tag>,
    };
    return map[level];
  };

  const gradeTag = (grade: string | null) => {
    if (!grade) return null;
    const colorMap: Record<string, string> = { A: "purple", B: "blue", C: "default", D: "default" };
    return <Tag color={colorMap[grade] || "default"}>{grade}</Tag>;
  };

  const columns = [
    // 第一行：列分组
    {
      title: "黄盒",
      key: "box_group",
      fixed: "left" as const,
      onHeaderCell: () => ({ style: { background: "#e6f7ff" } }),
      children: [
        { title: "黄盒SKU", dataIndex: "box_sku", key: "box_sku", width: 224, fixed: "left" as const },
      ],
    },
    {
      title: "主品参数",
      key: "main_group",
      onHeaderCell: () => ({ style: { background: "#fff7e6" } }),
      children: [
        { title: "主品SKU", dataIndex: "main_sku", key: "main_sku", width: 110 },
        { title: "等级", dataIndex: "product_grade", key: "product_grade", width: 60, render: (v: string | null) => gradeTag(v) },
        { title: "主品在途", dataIndex: "main_in_transit", key: "main_in_transit", width: 90, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "主品仓库可用", dataIndex: "main_available", key: "main_available", width: 110, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "主品计划在途", dataIndex: "main_planned_in_transit", key: "main_planned_in_transit", width: 110, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "主品90天销量", dataIndex: "main_sales_90d", key: "main_sales_90d", width: 110, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "主品日均销", dataIndex: "main_daily_avg_90d", key: "main_daily_avg_90d", width: 100, align: "right" as const, render: (v: number) => Math.round(v) },
      ],
    },
    {
      title: "黄盒参数",
      key: "box_params_group",
      onHeaderCell: () => ({ style: { background: "#f6ffed" } }),
      children: [
        { title: "黄盒在途", dataIndex: "box_in_transit", key: "box_in_transit", width: 90, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "海外仓可用", dataIndex: "box_overseas_available", key: "box_overseas_available", width: 100, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "计划在途", dataIndex: "box_planned_in_transit", key: "box_planned_in_transit", width: 90, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "国内仓可用", dataIndex: "box_domestic_available", key: "box_domestic_available", width: 100, align: "right" as const, render: (v: number) => Math.round(v) },
        { title: "黄盒90天销量", dataIndex: "box_sales_90d", key: "box_sales_90d", width: 95, align: "right" as const, render: (v: number) => Math.round(v) },
      ],
    },
    {
      title: "计算结果",
      key: "calc_group",
      children: [
        {
          title: "预估失败件数",
          dataIndex: "estimated_failure_qty",
          key: "estimated_failure_qty",
          width: 110,
          align: "right" as const,
          render: (v: number) => Math.round(v),
        },
        {
          title: "预估需求量",
          dataIndex: "estimated_demand_qty",
          key: "estimated_demand_qty",
          width: 105,
          align: "right" as const,
          render: (v: number) => Math.round(v),
        },
        {
          title: "计算调拨量",
          dataIndex: "calculated_transfer_qty",
          key: "calculated_transfer_qty",
          width: 105,
          align: "right" as const,
          render: (v: number) => (
            <span style={{ fontWeight: 600, color: v < 0 ? "#52c41a" : "#fa8c16" }}>
              {Math.round(v)}
            </span>
          ),
        },
        {
          title: (
            <span>
              优先级分
              <Popover content={PRIORITY_POPOVER_CONTENT} trigger="hover" placement="top">
                <QuestionCircleOutlined style={{ marginLeft: 4, color: "#94a3b8", fontSize: 12 }} />
              </Popover>
            </span>
          ),
          dataIndex: "priority_score",
          key: "priority_score",
          width: 85,
          align: "right" as const,
          render: (v: number) => <span style={{ color: "#94a3b8" }}>{Math.round(v)}</span>,
        },
      ],
    },
    {
      title: "人工调整",
      key: "adjust_group",
      children: [
        {
          title: "调整后",
          dataIndex: "adjusted_transfer_qty",
          key: "adjusted_transfer_qty",
          width: 80,
          align: "right" as const,
          render: (_: number, record: SnapshotRow) => {
            const isEditing = editingRowId === record.row_id;
            if (isEditing) {
              return (
                <InputNumber
                  autoFocus
                  min={0}
                  defaultValue={Math.round(record.adjusted_transfer_qty)}
                  onBlur={async (e) => {
                    const value = Number((e.target as HTMLInputElement).value || 0);
                    await saveAdjustment(record, value, record.adjust_note || "");
                  }}
                />
              );
            }
            return (
              <Button type="link" onClick={() => setEditingRowId(record.row_id)}>
                {Math.round(record.adjusted_transfer_qty)}
              </Button>
            );
          },
        },
        {
          title: "调整原因",
          dataIndex: "adjust_note",
          key: "adjust_note",
          width: 90,
          render: (_: string, record: SnapshotRow) => (
            <Button
              size="small"
              onClick={() => {
                setReasonRow(record);
                reasonForm.setFieldsValue({ adjust_note: record.adjust_note || "" });
                setReasonModalOpen(true);
              }}
            >
              {record.adjust_note ? "编辑" : "填写"}
            </Button>
          ),
        },
      ],
    },
    {
      title: "预警",
      key: "alert_group",
      children: [
        {
          title: "预警等级",
          dataIndex: "alert_level",
          key: "alert_level",
          width: 90,
          render: (v: SnapshotRow["alert_level"]) => alertTag(v),
        },
      ],
    },
    {
      title: "操作",
      key: "action_group",
      fixed: "right" as const,
      children: [
        {
          title: "趋势",
          key: "trend",
          width: 60,
          fixed: "right" as const,
          render: (_: unknown, record: SnapshotRow) =>
            activeWarehouseId ? (
              <Button
                size="small"
                icon={<LineChartOutlined />}
                onClick={() => handleTrend(record.main_sku, activeWarehouseId)}
              />
            ) : null,
        },
      ],
    },
  ];

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          黄盒缺货补货看板
        </Typography.Title>
        <Card title="数据源">
          <Space direction="vertical" size={12}>
            <Typography.Text type="secondary">
              输入 Google Sheets 公开链接，系统将自动读取数据。
            </Typography.Text>
            <Space>
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                style={{ width: 500 }}
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                onPressEnter={() => void readFromSheet()}
              />
              <Button
                icon={<CloudServerOutlined />}
                onClick={() => void readFromSheet()}
                loading={loading}
              >
                从 Google Sheets 读取
              </Button>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：请确保表格已设置为"任何人都可以查看"
            </Typography.Text>
            {sheetResult && (
              <Alert
                type="success"
                showIcon
                message={`读取成功：快照 #${sheetResult.snapshot_id}`}
                description={`仓库：${sheetResult.warehouse_name}，入库行数：${sheetResult.inserted_rows}`}
              />
            )}
          </Space>
        </Card>
        <Card>
          <Tabs
            activeKey={String(activeWarehouseId || "")}
            onChange={(key) => setActiveWarehouseId(Number(key))}
            items={warehouses.map((w) => ({
              key: String(w.warehouse_id),
              label: w.warehouse_name,
            }))}
          />
          <Space size={12} wrap style={{ marginBottom: 12 }}>
            <Card size="small">
              <Statistic title="紧急（R）" value={summary.R} valueStyle={{ color: "#ff4d4f" }} />
            </Card>
            <Card size="small">
              <Statistic title="预警（O）" value={summary.O} valueStyle={{ color: "#fa8c16" }} />
            </Card>
            <Card size="small">
              <Statistic title="关注（Y）" value={summary.Y} valueStyle={{ color: "#d4b106" }} />
            </Card>
            <Card size="small">
              <Statistic title="正常（G）" value={summary.G} valueStyle={{ color: "#52c41a" }} />
            </Card>
            <Popover content={FORMULA_POPOVER_CONTENT} trigger="hover" placement="bottom">
              <Typography.Text type="secondary" style={{ fontSize: 12, cursor: "help" }}>
                查看公式说明
              </Typography.Text>
            </Popover>
          </Space>
          <Space wrap size={8} style={{ marginBottom: 12 }}>
            <Select
              mode="multiple"
              allowClear
              placeholder="按商品等级"
              style={{ minWidth: 160 }}
              options={["A", "B", "C"].map((x) => ({ label: x, value: x }))}
              value={gradeFilter}
              onChange={setGradeFilter}
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="按预警等级"
              style={{ minWidth: 180 }}
              options={[
                { label: "紧急(R)", value: "R" },
                { label: "预警(O)", value: "O" },
                { label: "关注(Y)", value: "Y" },
                { label: "正常(G)", value: "G" },
              ]}
              value={alertFilter}
              onChange={setAlertFilter}
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="按国家"
              style={{ minWidth: 120 }}
              options={availableCountries.map((v) => ({ label: v, value: v }))}
              value={countryFilter}
              onChange={setCountryFilter}
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="按仓库名"
              style={{ minWidth: 200 }}
              options={availableWarehouses.map((v) => ({ label: v, value: v }))}
              value={warehouseFilter}
              onChange={setWarehouseFilter}
            />
            <Input.Search
              allowClear
              placeholder="搜索主品SKU / 黄盒SKU"
              style={{ width: 260 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button icon={<DownloadOutlined />} onClick={exportCurrentView}>
              导出当前视图
            </Button>
          </Space>
          <Table
            rowKey="row_id"
            loading={loadingRows}
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 2200 }}
            size="small"
          />
        </Card>
      </Space>

      {/* 调整原因弹窗 */}
      <Modal
        title="填写调整原因"
        open={reasonModalOpen}
        onCancel={() => setReasonModalOpen(false)}
        onOk={async () => {
          const note = reasonForm.getFieldValue("adjust_note") || "";
          if (reasonRow) {
            await saveAdjustment(reasonRow, reasonRow.adjusted_transfer_qty, note);
          }
          setReasonModalOpen(false);
        }}
      >
        <Form form={reasonForm} layout="vertical">
          <Form.Item name="adjust_note" label="调整原因（可选）">
            <Input.TextArea rows={4} placeholder="例如：活动备货、按整箱调拨等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 趋势弹窗 */}
      <Modal
        title={`${trendSku} 调拨量趋势`}
        open={trendModalOpen}
        onCancel={() => setTrendModalOpen(false)}
        footer={null}
        width={800}
      >
        {trendLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>加载中...</div>
        ) : (
          <div>
            {trendPoints.length === 0 ? (
              <div style={{ textAlign: "center", color: "#999", padding: 40 }}>暂无趋势数据</div>
            ) : (
              <TrendChartEmbed points={trendPoints} />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function TrendChartEmbed({ points }: { points: TrendPoint[] }) {
  const [ReactECharts, setReactECharts] = useState<typeof import("echarts-for-react") | null>(null);

  useEffect(() => {
    import("echarts-for-react").then((mod) => setReactECharts(mod.default));
  }, []);

  if (!ReactECharts || points.length === 0) return null;

  const dates = points.map((p) => p.uploaded_at.replace("T", " ").slice(0, 16));
  const option = {
    tooltip: { trigger: "axis", formatter: (params: { name: string; value: number; seriesName: string }[]) => params.map((p) => `<b>${p.seriesName}</b>：${Math.round(p.value)}<br/>`).join("") },
    legend: { data: ["计算调拨量", "调整后调拨量", "黄盒海外仓可用量"], top: 10 },
    grid: { left: 60, right: 30, top: 50, bottom: 50 },
    xAxis: { type: "category", data: dates, axisLabel: { rotate: 20 } },
    yAxis: { type: "value", name: "数量", minInterval: 1 },
    series: [
      {
        name: "计算调拨量",
        type: "line",
        data: points.map((p) => p.calculated_transfer_qty),
        smooth: true,
        lineStyle: { color: "#1677ff", width: 2 },
        itemStyle: { color: "#1677ff" },
      },
      {
        name: "调整后调拨量",
        type: "line",
        data: points.map((p) => p.adjusted_transfer_qty),
        smooth: true,
        lineStyle: { color: "#1677ff", width: 2, type: "dashed" },
        itemStyle: { color: "#82b1ff" },
      },
      {
        name: "黄盒海外仓可用量",
        type: "line",
        data: points.map((p) => p.box_overseas_available),
        smooth: true,
        lineStyle: { color: "#52c41a", width: 2 },
        itemStyle: { color: "#52c41a" },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320 }} />;
}
