import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Layout,
  Space,
  Tag,
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

  const uploadProps: UploadProps = {
    maxCount: 1,
    accept: ".xlsx,.xls",
    showUploadList: true,
    customRequest: async ({ file, onSuccess, onError }) => {
      const formData = new FormData();
      formData.append("file", file as File);
      formData.append("warehouse_name", "美国仓");
      formData.append("warehouse_region", "NA");
      setUploading(true);
      try {
        const response = await apiClient.post<UploadState>(
          "/api/snapshots/upload",
          formData
        );
        setUploadResult(response.data);
        message.success("Excel 上传成功");
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

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Space direction="vertical" size={16}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          黄盒缺货补货看板（Prompt 2）
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
      </Space>
    </Layout>
  );
}
