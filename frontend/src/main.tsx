import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { getUser } from "./api";
import { Layout } from "./components/Layout";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AuthPage } from "./pages/AuthPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { PagamentosPage } from "./pages/PagamentosPage";
import { TestePage } from "./pages/TestePage";
import { applyTheme } from "./theme";
import "./index.css";

applyTheme();

function Home() {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/dashboard" : "/teste"} replace />;
}

function Private({ admin, children }: { admin?: boolean; children: JSX.Element }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/teste" replace />;
  return <Layout>{children}</Layout>;
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/checkout/:code" element={<CheckoutPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/cadastro" element={<AuthPage mode="register" />} />
      <Route path="/dashboard" element={<Private admin><DashboardPage /></Private>} />
      <Route path="/pagamentos" element={<Private admin><PagamentosPage /></Private>} />
      <Route path="/admin" element={<Private admin><AdminPage /></Private>} />
      <Route path="/teste" element={<Private><TestePage /></Private>} />
      <Route path="*" element={<Home />} />
    </Routes>
    <Toaster richColors position="top-right" />
  </BrowserRouter>,
);
