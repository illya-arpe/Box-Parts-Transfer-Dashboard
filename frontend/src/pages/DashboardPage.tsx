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
  Upload,
  Form,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { DownloadOutlined, LineChartOutlined, UploadOutlined } from "@ant-design/icons";

import { apiClient } from "../api/client";

type UploadState = {
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
  box_overseas_available: number;
  box_in_transit: number;
  estimated_failure_qty: number;
  estimated_demand_qty: number;
  calculated_transfer_qty: number;
  adjusted_transfer_qty: number;
  adjust_note?: string | null;
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

export default function DashboardPage() {
  const [uploadResult, setUploadResult] = useState<UploadState>(null);
  const [uploading, setUploading] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOverview[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [alertFilter, setAlertFilter] = useState<string[]>([]);
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
  const templateUrl = `${apiClient.defaults.baseURL}/api/snapshots/template`;

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
      setRows(response.data.rows || []);
      setActiveSnapshotId((response.data as { snapshot_id?: number }).snapshot_id || null);
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

  const uploadProps: UploadProps = {
    maxCount: 1,
    accept: ".xlsx,.xls",
    showUploadList: true,
    customRequest: async ({ file, onSuccess, onError }) => {
      const formData = new FormData();
      formData.append("file", file as File);
      formData.append("warehouse_name", activeWarehouseName);
      formData.append("warehouse_region", "NA");
      setUploading(true);
      try {
        const response = await apiClient.post<UploadState>("/api/snapshots/upload", formData);
        setUploadResult(response.data);
        message.success("Excel 上传成功");
        await fetchWarehouses();
        if (activeWarehouseId !== null) {
          await fetchRows(activeWarehouseId);
        }
        onSuccess?.(response.data);
      } catch (error: unknown) {
        const err = error as {
          response?: { data?: { detail?: { message?: string } | string } };
        };
        const serverMessage =
          (typeof err.response?.data?.detail === "object" &&
            err.response?.data?.detail?.message) ||
          err.response?.data?.detail ||
          "上传失败，请检查模板列名";
        message.error(String(serverMessage));
        onError?.(error as Error);
      } finally {
        setUploading(false);
      }
    },
  };

  const filteredRows = rows.filter((row) => {
    const passGrade =
      gradeFilter.length === 0 ||
      gradeFilter.includes((row.product_grade || "").toUpperCase());
    const passAlert =
      alertFilter.length === 0 || alertFilter.includes(row.alert_level);
    const key = keyword.trim().toLowerCase();
    const passKeyword =
      key.length === 0 ||
      row.main_sku.toLowerCase().includes(key) ||
      row.box_sku.toLowerCase().includes(key);
    return passGrade && passAlert && passKeyword;
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

  const columns = [
    { title: "主品SKU", dataIndex: "main_sku", key: "main_sku" },
    { title: "黄盒SKU", dataIndex: "box_sku", key: "box_sku" },
    { title: "商品等级", dataIndex: "product_grade", key: "product_grade" },
    {
      title: "黄盒海外仓可用",
      dataIndex: "box_overseas_available",
      key: "box_overseas_available",
    },
    { title: "黄盒在途", dataIndex: "box_in_transit", key: "box_in_transit" },
    {
      title: "预估需求量",
      dataIndex: "estimated_demand_qty",
      key: "estimated_demand_qty",
    },
    {
      title: "计算调拨量",
      dataIndex: "calculated_transfer_qty",
      key: "calculated_transfer_qty",
      fixed: "right" as const,
    },
    {
      title: "调整后调拨量",
      dataIndex: "adjusted_transfer_qty",
      key: "adjusted_transfer_qty",
      fixed: "right" as const,
      render: (_: number, record: SnapshotRow) => {
        const isEditing = editingRowId === record.row_id;
        if (isEditing) {
          return (
            <InputNumber
              autoFocus
              defaultValue={record.adjusted_transfer_qty}
              onBlur={async (e) => {
                const value = Number((e.target as HTMLInputElement).value || 0);
                await saveAdjustment(record, value, record.adjust_note || "");
              }}
            />
          );
        }
        return (
          <Button type="link" onClick={() => setEditingRowId(record.row_id)}>
            {record.adjusted_transfer_qty}
          </Button>
        );
      },
    },
    {
      title: "预警等级",
      dataIndex: "alert_level",
      key: "alert_level",
      fixed: "right" as const,
      render: (value: SnapshotRow["alert_level"]) => {
        const map: Record<string, React.ReactNode> = {
          R: <Tag color="error">紧急</Tag>,
          O: <Tag color="warning">预警</Tag>,
          Y: <Tag color="gold">关注</Tag>,
          G: <Tag color="success">正常</Tag>,
        };
        return map[value];
      },
    },
    {
      title: "调整原因",
      dataIndex: "adjust_note",
      key: "adjust_note",
      fixed: "right" as const,
      render: (_: string, record: SnapshotRow) => (
        <Button
          size="small"
          onClick={() => {
            setReasonRow(record);
            reasonForm.setFieldsValue({ adjust_note: record.adjust_note || "" });
            setReasonModalOpen(true);
          }}
        >
          {record.adjust_note ? "编辑原因" : "填写原因"}
        </Button>
      ),
    },
    {
      title: "趋势",
      key: "trend",
      fixed: "right" as const,
      render: (_: unknown, record: SnapshotRow) =>
        activeWarehouseId ? (
          <Button
            size="small"
            icon={<LineChartOutlined />}
            onClick={() => handleTrend(record.main_sku, activeWarehouseId)}
          >
            趋势
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          黄盒缺货补货看板
        </Typography.Title>
        <Card title="Excel 上传">
          <Space direction="vertical" size={12}>
            <Typography.Text type="secondary">
              请使用标准模板列名上传，当前默认按"美国仓"写入快照数据。
            </Typography.Text>
            <Space>
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} loading={uploading}>
                  上传 Excel（.xlsx/.xls）
                </Button>
              </Upload>
              <Button
                icon={<DownloadOutlined />}
                href={templateUrl}
                target="_blank"
                rel="noreferrer"
              >
                下载模板
              </Button>
            </Space>
            {uploadResult && (
              <Alert
                type="success"
                showIcon
                message={`上传成功：快照 #${uploadResult.snapshot_id}`}
                description={`仓库：${uploadResult.warehouse_name}，入库行数：${uploadResult.inserted_rows}`}
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
              <Statistic title="紧急（红）" value={summary.R} valueStyle={{ color: "#ff4d4f" }} />
            </Card>
            <Card size="small">
              <Statistic title="预警（橙）" value={summary.O} valueStyle={{ color: "#fa8c16" }} />
            </Card>
            <Card size="small">
              <Statistic title="关注（黄）" value={summary.Y} valueStyle={{ color: "#d4b106" }} />
            </Card>
            <Card size="small">
              <Statistic title="正常（绿）" value={summary.G} valueStyle={{ color: "#52c41a" }} />
            </Card>
          </Space>
          <Space wrap style={{ marginBottom: 12 }}>
            <Select
              mode="multiple"
              allowClear
              placeholder="按商品等级筛选"
              style={{ width: 220 }}
              options={["A", "B", "C"].map((x) => ({ label: x, value: x }))}
              value={gradeFilter}
              onChange={setGradeFilter}
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="按预警等级筛选"
              style={{ width: 220 }}
              options={[
                { label: "紧急(R)", value: "R" },
                { label: "预警(O)", value: "O" },
                { label: "关注(Y)", value: "Y" },
                { label: "正常(G)", value: "G" },
              ]}
              value={alertFilter}
              onChange={setAlertFilter}
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
            scroll={{ x: 1200 }}
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
    tooltip: { trigger: "axis" },
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
