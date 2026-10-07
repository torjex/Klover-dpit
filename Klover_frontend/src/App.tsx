import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { WateringPage } from "./pages/WateringPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { WeatherPage } from "./pages/WeatherPage";
import { DataPage } from "./pages/DataPage";
import { Logo } from "./components/ui";

export function App() {
  const { signedIn, ready } = useAuth();

  if (!ready) return <BootScreen />;

  if (!signedIn)
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<WateringPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/weather" element={<WeatherPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function BootScreen() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", gap: 14, background: "var(--ivory)" }}>
      <Logo size={38} />
      <span style={{ color: "var(--muted)", fontSize: 13 }}>Loading your garden…</span>
    </div>
  );
}
