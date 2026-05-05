import { useEffect, useState } from "react";
import { Layout, Space, Tag, Typography } from "antd";

import { apiClient } from "./api/client";

type HealthState = "loading" | "ok" | "error";

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

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Space direction="vertical" size={16}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Hello 黄盒看板
        </Typography.Title>
        <HealthIndicator state={healthState} />
      </Space>
    </Layout>
  );
}
