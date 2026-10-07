import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { PageHead } from "../components/layout/AppShell";
import { Alert, Card, EmptyState, Icon, Skeleton, Stat } from "../components/ui";

const POLL_MS = 3_000;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function DataPage() {
  const sensors = useAsync(() => api.sensors(), [], { intervalMs: POLL_MS });

  const notYetReporting = sensors.error === "No sensor reading yet for this zone.";
  const otherError = sensors.error && !notYetReporting ? sensors.error : null;

  return (
    <>
      <PageHead icon="database" title="Sensor data" subtitle="Live readings reported by the ESP32." />

      {otherError ? <Alert tone="error">{otherError}</Alert> : null}

      {sensors.initial ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <Card key={i} pad>
              <Skeleton height={56} />
            </Card>
          ))}
        </div>
      ) : notYetReporting ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState icon="database" title="No readings yet">
            Nothing has come in from the ESP32 for this zone. Check it's powered on and connected to the
            hotspot and MQTT broker.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <Stat
              icon="sun"
              value={sensors.data?.air_temp_c != null ? `${sensors.data.air_temp_c.toFixed(1)}°C` : "—"}
              label="Air temperature"
            />
            <Stat
              icon="cloud"
              value={sensors.data?.air_humidity_pct != null ? `${sensors.data.air_humidity_pct.toFixed(0)}%` : "—"}
              label="Air humidity"
            />
            <Stat
              icon="leaf"
              value={sensors.data?.soil_humidity_pct != null ? `${sensors.data.soil_humidity_pct.toFixed(0)}%` : "—"}
              label="Soil humidity"
            />
          </div>

          {sensors.data ? (
            <p className="watering__eyebrow" style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="clock" size={15} />
              Last updated {timeAgo(sensors.data.receivedAt)}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
