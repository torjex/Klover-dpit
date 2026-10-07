import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { PageHead } from "../components/layout/AppShell";
import { Alert, Badge, Card, CardHeader, Icon, Skeleton, Stat } from "../components/ui";

/** Mirrors the default rainThresholdPercent in the backend's irrigationService.autoWater(). */
const RAIN_SKIP_THRESHOLD = 60;
const REFRESH_MS = 5 * 60_000;

export function WeatherPage() {
  const rain = useAsync(() => api.rainChance(), [], { intervalMs: REFRESH_MS });
  const current = useAsync(() => api.currentConditions(), [], { intervalMs: REFRESH_MS });

  const error = rain.error ?? current.error;
  const loading = rain.initial || current.initial;
  const chance = rain.data?.rainChancePercent ?? null;
  const skipping = chance !== null && chance >= RAIN_SKIP_THRESHOLD;

  return (
    <>
      <PageHead
        icon="cloud"
        title="Weather"
        subtitle="Live conditions and the forecast that decides whether scheduled runs go ahead."
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} pad>
              <Skeleton height={56} />
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <Stat
            icon="rain"
            value={chance !== null ? `${Math.round(chance)}%` : "—"}
            label="Chance of rain today"
            hint={rain.data ? rain.data.date : undefined}
          />
          <Stat
            icon="droplet"
            value={rain.data?.expectedMm != null ? `${rain.data.expectedMm.toFixed(1)} mm` : "—"}
            label="Expected rainfall today"
          />
          <Stat
            icon="sun"
            value={current.data?.temperatureC != null ? `${current.data.temperatureC.toFixed(1)}°C` : "—"}
            label="Temperature now"
          />
          <Stat
            icon="cloud"
            value={current.data ? (current.data.isRainingNow ? "Yes" : "No") : "—"}
            label="Raining right now"
          />
        </div>
      )}

      <Card style={{ marginTop: 14 }}>
        <CardHeader
          title="Automatic watering today"
          actions={
            chance !== null ? (
              skipping ? (
                <Badge tone="warn" icon="rain">
                  Will skip
                </Badge>
              ) : (
                <Badge tone="success" icon="check">
                  Will run
                </Badge>
              )
            ) : null
          }
        />
        <p className="card__subtitle" style={{ padding: "0 20px 20px", display: "flex", gap: 8, alignItems: "center" }}>
          <Icon name="info" size={16} />
          Manual "Start watering" runs always go ahead, whatever the forecast says.
        </p>
      </Card>
    </>
  );
}
