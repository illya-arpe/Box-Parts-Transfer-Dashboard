import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Layout,
  List,
  message,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { HistoryOutlined, LineChartOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";

import { apiClient } from "../api/client";
import SkuTrendChart from "../components/SkuTrendChart";

type WarehouseInfo = {
  warehouse_id: number;
  warehouse_name: string;
  region: string | null;
  latest_snapshot_id: number | null;
};

type SnapshotMeta = {
  id: number;
  warehouse_id: number;
  created_at: string;
  row_count: number;
  alert_r: number;
  alert_o: number;
  alert_y: number;
  alert_g: number;
};

type CompareItem = {
  sku_code: string;
  box_sku_code: string;
  product_name: string | null;
  grade: string | null;
  old_alert_level: string;
  new_alert_level: string;
  old_calculated_transfer_qty: number;
  new_calculated_transfer_qty: number;
  diff_pct: number | null;
  improved: boolean;
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

type TrendModal = {
  sku_code: string;
  warehouse_id: number;
} | null;

const ALERT_COLORS: Record<string, string> = {
  R: "error",
  O: "warning",
  Y: "gold",
  G: "success",
};
const ALERT_LABELS: Record<string, string> = { R: "紧急", O: "预警", Y: "关注", G: "正常" };

function formatDate(iso: string) {
  return iso.replace("T", " ").slice(0, 16);
}

export default function HistoryPage() {
  const [searchParams] = useSearchParams();
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotMeta | null>(null);
  const [compareDrawerOpen, setCompareDrawerOpen] = useState(false);
  const [compareData, setCompareData] = useState<CompareItem[]>([]);
  const [trendModal, setTrendModal] = useState<TrendModal>(null);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ warehouses: WarehouseInfo[] }>("/api/snapshots/warehouses")
      .then((r) => {
        setWarehouses(r.data.warehouses);
        const defaultId =
          Number(searchParams.get("warehouse_id")) ||
          r.data.warehouses[0]?.warehouse_id ||
          null;
        setActiveWarehouseId(defaultId);
      })
      .catch(() => message.error("仓库列表加载失败"));
  }, []);

  useEffect(() => {
    if (!activeWarehouseId) return;
    setLoadingSnapshots(true);
    setSelectedSnapshot(null);
    apiClient
      .get<{ snapshots: SnapshotMeta[] }>(
        `/api/snapshots?warehouse_id=${activeWarehouseId}`
      )
      .then((r) => setSnapshots(r.data.snapshots || []))
      .catch(() => message.error("快照列表加载失败"))
      .finally(() => setLoadingSnapshots(false));
  }, [activeWarehouseId]);

  const handleCompare = async (snap: SnapshotMeta) => {
    if (snapshots.length < 2) {
      message.warning("至少需要两个快照才能对比");
      return;
    }
    const idx = snapshots.findIndex((s) => s.id === snap.id);
    const older = snapshots[idx + 1];
    if (!older) {
      message.warning("没有更早的快照可对比");
      return;
    }
    try {
      const r = await apiClient.get<{
        items: CompareItem[];
        changed_count: number;
      }>(`/api/snapshots/compare?old=${older.id}&new=${snap.id}`);
      setCompareData(r.data.items);
      setSelectedSnapshot(snap);
      setCompareDrawerOpen(true);
    } catch {
      message.error("对比数据加载失败");
    }
  };

  const handleTrend = async (skuCode: string, warehouseId: number) => {
    setTrendModal({ sku_code: skuCode, warehouse_id: warehouseId });
    setLoadingTrend(true);
    setTrendPoints([]);
    try {
      const r = await apiClient.get<{ points: TrendPoint[] }>(
        `/api/skus/${encodeURIComponent(skuCode)}/trend?warehouse_id=${warehouseId}&limit=12`
      );
      setTrendPoints(r.data.points);
    } catch {
      message.error("趋势数据加载失败");
    } finally {
      setLoadingTrend(false);
    }
  };

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <HistoryOutlined /> 历史快照
        </Typography.Title>

        <Card>
          <Space>
            <Typography.Text>仓库：</Typography.Text>
            <Select
              style={{ width: 200 }}
              value={activeWarehouseId}
              onChange={(v) => setActiveWarehouseId(v)}
              options={warehouses.map((w) => ({
                label: w.warehouse_name,
                value: w.warehouse_id,
              }))}
            />
          </Space>
        </Card>

        <Row gutter={16}>
          <Col span={6}>
            <Card title="快照列表" loading={loadingSnapshots}>
              {snapshots.length === 0 ? (
                <Empty description="暂无快照" />
              ) : (
                <List
                  dataSource={snapshots}
                  renderItem={(snap) => (
                    <List.Item
                      key={snap.id}
                      style={{
                        cursor: "pointer",
                        background:
                          selectedSnapshot?.id === snap.id
                            ? "#e6f4ff"
                            : undefined,
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                      onClick={() => setSelectedSnapshot(snap)}
                      extra={
                        <Button
                          size="small"
                          icon={<LineChartOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompare(snap);
                          }}
                        >
                          对比
                        </Button>
                      }
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <span>{formatDate(snap.created_at)}</span>
                            {snap.alert_r > 0 && (
                              <Tag color="error" style={{ margin: 0 }}>
                                {snap.alert_r}
                              </Tag>
                            )}
                          </Space>
                        }
                        description={
                          <Space size={4}>
                            <Tag>R{snap.alert_r}</Tag>
                            <Tag color="warning">O{snap.alert_o}</Tag>
                            <Tag color="gold">Y{snap.alert_y}</Tag>
                            <Tag color="success">G{snap.alert_g}</Tag>
                            <span style={{ color: "#999", fontSize: 12 }}>
                              共 {snap.row_count} 行
                            </span>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>

          <Col span={18}>
            {selectedSnapshot ? (
              <Card
                title={`概览：${formatDate(selectedSnapshot.created_at)}`}
              >
                <Row gutter={16}>
                  <Col>
                    <Statistic
                      title="紧急"
                      value={selectedSnapshot.alert_r}
                      valueStyle={{ color: "#ff4d4f" }}
                    />
                  </Col>
                  <Col>
                    <Statistic
                      title="预警"
                      value={selectedSnapshot.alert_o}
                      valueStyle={{ color: "#fa8c16" }}
                    />
                  </Col>
                  <Col>
                    <Statistic
                      title="关注"
                      value={selectedSnapshot.alert_y}
                      valueStyle={{ color: "#d4b106" }}
                    />
                  </Col>
                  <Col>
                    <Statistic
                      title="正常"
                      value={selectedSnapshot.alert_g}
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                </Row>
                <div style={{ marginTop: 16 }}>
                  <Button onClick={() => handleCompare(selectedSnapshot)}>
                    与上一次对比
                  </Button>
                </div>
              </Card>
            ) : (
              <Card>
                <Empty description="请从左侧选择一个快照" />
              </Card>
            )}
          </Col>
        </Row>
      </Space>

      {/* 对比 Drawer */}
      <Drawer
        title="预警等级变化"
        open={compareDrawerOpen}
        onClose={() => setCompareDrawerOpen(false)}
        width={640}
      >
        {compareData.length === 0 ? (
          <Empty description="本次对比无等级变化的 SKU" />
        ) : (
          <List
            dataSource={compareData}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Typography.Text strong>{item.sku_code}</Typography.Text>
                      <Tag>{item.box_sku_code}</Tag>
                      {item.grade && <Tag>{item.grade}</Tag>}
                    </Space>
                  }
                  description={
                    <Space>
                      <Tag color={ALERT_COLORS[item.old_alert_level]}>
                        {ALERT_LABELS[item.old_alert_level]}
                      </Tag>
                      <span>→</span>
                      <Tag color={ALERT_COLORS[item.new_alert_level]}>
                        {ALERT_LABELS[item.new_alert_level]}
                      </Tag>
                      {item.diff_pct !== null && (
                        <Tag color={item.improved ? "success" : "error"}>
                          {item.improved ? "↓" : "↑"}
                          {Math.abs(item.diff_pct)}%
                        </Tag>
                      )}
                    </Space>
                  }
                />
                <Button
                  size="small"
                  icon={<LineChartOutlined />}
                  onClick={() =>
                    activeWarehouseId &&
                    handleTrend(item.sku_code, activeWarehouseId)
                  }
                >
                  趋势
                </Button>
              </List.Item>
            )}
          />
        )}
      </Drawer>

      {/* 趋势弹窗 */}
      <Modal
        title={`${trendModal?.sku_code} 趋势`}
        open={trendModal !== null}
        onCancel={() => setTrendModal(null)}
        footer={null}
        width={800}
      >
        {loadingTrend ? (
          <div style={{ textAlign: "center", padding: 40 }}>加载中...</div>
        ) : (
          <SkuTrendChart
            title={`${trendModal?.sku_code} 调拨量趋势`}
            points={trendPoints}
          />
        )}
      </Modal>
    </Layout>
  );
}
