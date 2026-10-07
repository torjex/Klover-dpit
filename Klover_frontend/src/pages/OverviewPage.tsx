import { useMemo } from "react";
import { api, num } from "../api/client";
import { useAsync, useSecondsTick } from "../hooks/useAsync";
import { PageHead } from "../components/layout/AppShell";
import { Alert, Card, EmptyState } from "../components/ui";
import { ZonesSection } from "../components/ZonesSection";
import type { ZoneCardData } from "../components/ZonesSection";
import {
  ActiveZonesCard,
  NextScheduleCard,
  RainProbabilityCard,
  StatCardSkeleton,
  WaterUsageCard,
} from "../components/StatCards";
import { formatPercentChange, formatTimeUtc, relativeDayUtc } from "../lib/format";
import type { Field, Schedule, Sensor } from "../api/types";

export function OverviewPage() {
  const zones = useAsync(() => api.zones(), [], { intervalMs: 15_000 });
  const today = useAsync(() => api.consumption("today"), [], { intervalMs: 60_000 });
  const week = useAsync(() => api.dailyConsumption("month"), []);
  const weather = useAsync(() => api.weather(), [], { intervalMs: 15 * 60_000 });
  const schedules = useAsync(() => api.schedules(), []);
  const garden = useAsync(loadGarden, []);

  const running = (zones.data ?? []).filter((z) => z.active_run_id);
  const tick = useSecondsTick(running.length > 0);

  const enabledCount = (zones.data ?? []).filter((z) => z.enabled).length;
  const totalToday = today.data?.totalLiters ?? 0;
  const days = week.data?.days ?? [];
  const yesterday = days.length >= 2 ? days[days.length - 2].liters : 0;
  const trend = formatPercentChange(totalToday, yesterday);

  const sparkline = days.slice(-10).map((day) => day.liters);

  const nextSchedule = pickNextSchedule(schedules.data ?? []);

  const zoneCards = useMemo<ZoneCardData[]>(() => {
    const fieldById = new Map((garden.data?.fields ?? []).map((f) => [String(f.id), f]));
    const moistureByField = new Map(
      (garden.data?.sensors ?? [])
        .filter((s) => s.soil_moisture !== null && s.reading_freshness !== "unknown")
        .map((s) => [String(s.field_id), num(s.soil_moisture)]),
    );
    const litersByZone = new Map(
      (today.data?.byZone ?? []).map((entry) => [entry.zone_id, entry.liters]),
    );
    const nextByZone = new Map<string, string>();
    for (const schedule of schedules.data ?? []) {
      if (!schedule.enabled || !schedule.nextRunAt) continue;
      const current = nextByZone.get(schedule.zone_id);
      if (!current || Date.parse(schedule.nextRunAt) < Date.parse(current))
        nextByZone.set(schedule.zone_id, schedule.nextRunAt);
    }

    return (zones.data ?? []).map((zone) => {
      const field = zone.field_id ? fieldById.get(String(zone.field_id)) : undefined;
      return {
        zone,
        crop: field?.crop_type ?? field?.name ?? "Irrigation zone",
        nextRunAt: nextByZone.get(zone.id) ?? null,
        litersToday: litersByZone.get(zone.id) ?? 0,
        soilMoisture: zone.field_id
          ? (moistureByField.get(String(zone.field_id)) ?? null)
          : null,
      };
    });
  }, [zones.data, garden.data, today.data, schedules.data]);

  const loading = zones.initial || today.initial;

  return (
    <>
      <PageHead
        title="Your garden, at a glance"
        subtitle={
          running.length
            ? `${running.length} zone${running.length > 1 ? "s" : ""} watering right now.`
            : "Everything looks good. Enjoy your garden!"
        }
      />

      {zones.error ? (
        <div className="overview__banner">
          <Alert tone="error">{zones.error}</Alert>
        </div>
      ) : null}

      <div className="ovc-band">
        <div className="ovc-grid">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <ActiveZonesCard active={enabledCount} total={(zones.data ?? []).length} />
              <WaterUsageCard liters={totalToday} trend={trend} series={sparkline} />
              <RainProbabilityCard
                percent={weather.data?.rainChancePercent ?? 0}
                unavailable={!!weather.error || !weather.data}
              />
              <NextScheduleCard
                day={nextSchedule ? relativeDayUtc(nextSchedule.nextRunAt!) : null}
                time={nextSchedule ? formatTimeUtc(nextSchedule.nextRunAt!) : null}
                name={nextSchedule ? nextSchedule.name : "No enabled schedules"}
              />
            </>
          )}
        </div>
      </div>

      {zones.initial || (zones.data ?? []).length > 0 ? (
        <ZonesSection items={zoneCards} loading={zones.initial} now={tick} />
      ) : (
        <Card style={{ marginTop: 30 }}>
          <EmptyState icon="zones" title="No zones yet">
            Add your first irrigation zone to start watering and tracking usage.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

async function loadGarden(): Promise<{ fields: Field[]; sensors: Sensor[] }> {
  const farms = await api.farms();
  const fields = (
    await Promise.all(farms.map((farm) => api.fields(String(farm.id))))
  ).flat();
  const sensors = (
    await Promise.all(fields.map((field) => api.sensors(String(field.id)).catch(() => [])))
  ).flat();
  return { fields, sensors };
}

function pickNextSchedule(schedules: Schedule[]): Schedule | null {
  return (
    schedules
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0] ?? null
  );
}

