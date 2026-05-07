import React from "react";
import ReactECharts from "echarts-for-react";

type TrendPoint = {
  snapshot_id: number;
  uploaded_at: string;
  calculated_transfer_qty: number;
  adjusted_transfer_qty: number;
  box_overseas_available: number;
  main_daily_avg_90d: number;
  alert_level: "R" | "O" | "Y" | "G";
};

type Props = {
  title: string;
  points: TrendPoint[];
};

const ALERT_LABEL: Record<string, string> = {
  R: "紧急",
  O: "预警",
  Y: "关注",
  G: "正常",
};

export default function SkuTrendChart({ title, points }: Props) {
  if (points.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#999", padding: "40px 0" }}>
        暂无趋势数据
      </div>
    );
  }

  const dates = points.map((p) =>
    p.uploaded_at.replace("T", " ").slice(0, 16)
  );
  const calcQty = points.map((p) => p.calculated_transfer_qty);
  const adjQty = points.map((p) => p.adjusted_transfer_qty);
  const overseasAvail = points.map((p) => p.box_overseas_available);
  const alertLevels = points.map((p) => ALERT_LABEL[p.alert_level] ?? p.alert_level);

  const option = {
    title: {
      text: title,
      left: "center",
      textStyle: { fontSize: 14, fontWeight: 600 },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: { name: string; value: number; seriesName: string }[]) => {
        if (!params.length) return "";
        const idx = dates.indexOf(params[0].name);
        const alert = idx >= 0 ? alertLevels[idx] : "";
        return params
          .map(
            (p) =>
              `<b>${p.seriesName}</b>：${Math.round(p.value)}<br/>`
          )
          .join("") + `<b>预警等级</b>：${alert}`;
      },
    },
    legend: {
      data: ["计算调拨量", "调整后调拨量", "黄盒海外仓可用量"],
      top: 32,
    },
    grid: { left: 60, right: 30, top: 80, bottom: 50 },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { rotate: 20, fontSize: 11 },
    },
    yAxis: { type: "value", name: "数量", minInterval: 1 },
    series: [
      {
        name: "计算调拨量",
        type: "line",
        data: calcQty,
        smooth: true,
        lineStyle: { color: "#1677ff", width: 2 },
        itemStyle: { color: "#1677ff" },
      },
      {
        name: "调整后调拨量",
        type: "line",
        data: adjQty,
        smooth: true,
        lineStyle: { color: "#1677ff", width: 2, type: "dashed" },
        itemStyle: { color: "#1677ff" },
      },
      {
        name: "黄盒海外仓可用量",
        type: "line",
        data: overseasAvail,
        smooth: true,
        lineStyle: { color: "#52c41a", width: 2 },
        itemStyle: { color: "#52c41a" },
      },
    ],
  };

  return (
    <ReactECharts option={option} style={{ height: 320 }} />
  );
}
