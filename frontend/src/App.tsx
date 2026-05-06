import React from "react";
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { ConfigProvider, Layout, Menu } from "antd";
import { DashboardOutlined, HistoryOutlined, UploadOutlined } from "@ant-design/icons";

import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import "antd/dist/reset.css";

const { Header, Content } = Layout;

function NavLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey =
    location.pathname === "/history" ? "history" : "dashboard";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#001529",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: 600,
            marginRight: 40,
            userSelect: "none",
          }}
        >
          黄盒补货看板
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[activeKey]}
          onClick={({ key }) => {
            if (key === "dashboard") navigate("/");
            else if (key === "history") navigate("/history");
          }}
          items={[
            {
              key: "dashboard",
              icon: <DashboardOutlined />,
              label: "看板主页",
            },
            {
              key: "history",
              icon: <HistoryOutlined />,
              label: "历史快照",
            },
          ]}
          style={{ flex: 1, minWidth: 0, background: "transparent" }}
        />
      </Header>
      <Content style={{ padding: 24, background: "#f5f7fb", minHeight: "calc(100vh - 64px)" }}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
        },
      }}
    >
      <BrowserRouter>
        <NavLayout />
      </BrowserRouter>
    </ConfigProvider>
  );
}
