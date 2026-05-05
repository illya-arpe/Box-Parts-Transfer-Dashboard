import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Layout,
  Select,
  Space,
  Statistic,
  Tag,
  Tabs,
  Table,
  Input,
  Typography,
  Upload,
  message
} from "antd";
import type { UploadProps } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";

import { apiClient } from "./api/client";

type HealthState = "loading" | "ok" | "error";
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
  alert_level: "R" | "O" | "Y" | "G";
};

function HealthIndicator({ state }: { state: HealthState }) {
  if (state === "ok") {
    return <Tag color="success">绿色 ✓ 后端已连通</Tag>;
  }
  if (state === "error") {
    return <Tag color="error">红色 ✗ 后端未连通</Tag>;
  }
  return <Tag color="processing">检测中...</Tag>;
}

export default function App() {
  const [healthState, setHealthState] = useState<HealthState>("loading");
  const [uploadResult, setUploadResult] = useState<UploadState>(null);
  const [uploading, setUploading] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOverview[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [alertFilter, setAlertFilter] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const templateUrl = useMemo(
    () => `${apiClient.defaults.baseURL}/api/snapshots/template`,
    []
  );

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await apiClient.get<{ status: string }>("/api/health");
        setHealthState(response.data.status === "ok" ? "ok" : "error");
      } catch (error) {
        setHealthState("error");
      }
    };
    void fetchHealth();
  }, []);

  const fetchWarehouses = async () => {
    try {
      const response = await apiClient.get<{ warehouses: WarehouseOverview[] }>(
        "/api/snapshots/warehouses"
      );
      setWarehouses(response.data.warehouses);
      if (response.data.warehouses.length > 0 && activeWarehouseId === null) {
        setActiveWarehouseId(response.data.warehouses[0].warehouse_id);
      }
    } catch (error) {
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
    } catch (error) {
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
    warehouses.find((w) => w.warehouse_id === activeWarehouseId)?.warehouse_name ||
    "美国仓";

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
        const response = await apiClient.post<UploadState>(
          "/api/snapshots/upload",
          formData
        );
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
    }
  };

  const filteredRows = rows.filter((row) => {
    const passGrade =
      gradeFilter.length === 0 || gradeFilter.includes((row.product_grade || "").toUpperCase());
    const passAlert = alertFilter.length === 0 || alertFilter.includes(row.alert_level);
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

  const columns = [
    {
      title: "主品SKU",
      dataIndex: "main_sku",
      key: "main_sku",
      sorter: (a: SnapshotRow, b: SnapshotRow) => a.main_sku.localeCompare(b.main_sku)
    },
    {
      title: "黄盒SKU",
      dataIndex: "box_sku",
      key: "box_sku",
      sorter: (a: SnapshotRow, b: SnapshotRow) => a.box_sku.localeCompare(b.box_sku)
    },
    { title: "商品等级", dataIndex: "product_grade", key: "product_grade" },
    {
      title: "黄盒海外仓可用",
      dataIndex: "box_overseas_available",
      key: "box_overseas_available",
      sorter: (a: SnapshotRow, b: SnapshotRow) =>
        a.box_overseas_available - b.box_overseas_available
    },
    {
      title: "黄盒在途",
      dataIndex: "box_in_transit",
      key: "box_in_transit",
      sorter: (a: SnapshotRow, b: SnapshotRow) => a.box_in_transit - b.box_in_transit
    },
    {
      title: "预估需求量",
      dataIndex: "estimated_demand_qty",
      key: "estimated_demand_qty",
      sorter: (a: SnapshotRow, b: SnapshotRow) =>
        a.estimated_demand_qty - b.estimated_demand_qty
    },
    {
      title: "计算调拨量",
      dataIndex: "calculated_transfer_qty",
      key: "calculated_transfer_qty",
      sorter: (a: SnapshotRow, b: SnapshotRow) =>
        a.calculated_transfer_qty - b.calculated_transfer_qty,
      fixed: "right" as const
    },
    {
      title: "预警等级",
      dataIndex: "alert_level",
      key: "alert_level",
      fixed: "right" as const,
      render: (value: SnapshotRow["alert_level"]) => {
        const map = {
          R: <Tag color="error">紧急</Tag>,
          O: <Tag color="warning">预警</Tag>,
          Y: <Tag color="gold">关注</Tag>,
          G: <Tag color="success">正常</Tag>
        };
        return map[value];
      }
    }
  ];

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Space direction="vertical" size={16}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          黄盒缺货补货看板（Prompt 4）
        </Typography.Title>
        <HealthIndicator state={healthState} />
        <Card title="Excel 上传与列名映射">
          <Space direction="vertical" size={12}>
            <Typography.Text type="secondary">
              请使用标准模板列名上传，当前默认按“美国仓”写入快照数据。
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
                下载模板（示例）
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
              label: w.warehouse_name
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
                { label: "正常(G)", value: "G" }
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
          </Space>
          <Table
            rowKey="row_id"
            loading={loadingRows}
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1100 }}
          />
        </Card>
      </Space>
    </Layout>
  );
}
