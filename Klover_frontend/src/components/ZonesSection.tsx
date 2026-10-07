import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, Skeleton } from "./ui";
import type { IconName } from "./ui";
import {
  formatClock,
  formatLiters,
  formatWhenShortUtc,
  formatWhenUtc,
} from "../lib/format";
import { zonePhoto } from "../lib/zoneImages";
import type { Zone } from "../api/types";
import "./ZonesSection.css";

const VIEW_KEY = "klover.zoneView";

export interface ZoneCardData {
  zone: Zone;
  crop: string;
  nextRunAt: string | null;
  litersToday: number;
  soilMoisture: number | null;
}

type View = "grid" | "list";

export function ZonesSection({
  items,
  loading,
  now,
}: {
  items: ZoneCardData[];
  loading: boolean;
  now: number;
}) {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* remembering the view is a convenience, not a requirement */
    }
  }, [view]);

  return (
    <section className="zsec">
      <header className="zsec__head">
        <span className="zsec__badge">
          <Icon name="leaf" size={24} strokeWidth={1.7} />
        </span>
        <div className="zsec__heading">
          <h2 className="zsec__title">Zones</h2>
          <p className="zsec__subtitle">Manage your irrigation zones and monitor their status</p>
        </div>
        <div className="zsec__views" role="group" aria-label="Zone layout">
          <ViewButton current={view} value="grid" icon="overview" label="Grid" onSelect={setView} />
          <ViewButton current={view} value="list" icon="list" label="List" onSelect={setView} />
        </div>
      </header>

      {loading ? (
        <div className="zsec__grid">
          <ZoneCardSkeleton />
          <ZoneCardSkeleton />
          <ZoneCardSkeleton />
        </div>
      ) : view === "grid" ? (
        <div className="zsec__grid">
          {items.map((item) => (
            <ZoneCard key={item.zone.id} data={item} now={now} />
          ))}
        </div>
      ) : (
        <div className="zsec__list">
          {items.map((item) => (
            <ZoneRow key={item.zone.id} data={item} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function ViewButton({
  current,
  value,
  icon,
  label,
  onSelect,
}: {
  current: View;
  value: View;
  icon: IconName;
  label: string;
  onSelect: (next: View) => void;
}) {
  return (
    <button
      type="button"
      className="zsec__view"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      <Icon name={icon} size={16} strokeWidth={1.9} />
      {label}
    </button>
  );
}


function ZoneCard({ data, now }: { data: ZoneCardData; now: number }) {
  const status = zoneStatus(data.zone);
  return (
    <Link to="/watering" state={{ zoneId: data.zone.id }} className="zcard">
      <div className="zcard__media">
        <img src={zonePhoto(data.zone)} alt="" loading="lazy" />
        <span className="zcard__status">
          <span className={`zcard__status-dot zcard__status-dot--${status.tone}`} />
          {status.label}
        </span>
      </div>

      <div className="zcard__body">
        <div className="zcard__name-row">
          <span className="zcard__name">{data.zone.name}</span>
          <Icon name="chevron-right" size={19} strokeWidth={2} className="zcard__chevron" />
        </div>
        <p className="zcard__crop">{data.crop}</p>
      </div>

      <div className="zcard__metrics">
        <ZoneMetrics data={data} now={now} />
      </div>
    </Link>
  );
}


function ZoneRow({ data, now }: { data: ZoneCardData; now: number }) {
  const status = zoneStatus(data.zone);
  return (
    <Link to="/watering" state={{ zoneId: data.zone.id }} className="zrow">
      <img className="zrow__thumb" src={zonePhoto(data.zone)} alt="" loading="lazy" />
      <div className="zrow__identity">
        <div className="zrow__name">{data.zone.name}</div>
        <div className="zrow__crop">{data.crop}</div>
      </div>
      <span className="zrow__status">
        <span className={`zcard__status-dot zcard__status-dot--${status.tone}`} />
        {status.label}
      </span>
      <div className="zrow__metrics">
        <ZoneMetrics data={data} now={now} />
      </div>
      <Icon name="chevron-right" size={19} strokeWidth={2} className="zrow__chevron" />
    </Link>
  );
}


function ZoneMetrics({ data, now }: { data: ZoneCardData; now: number }) {
  const running = runningLabel(data.zone, now);
  const paused = !data.zone.enabled;
  return (
    <>
      <Metric
        icon="droplet"
        label={running ? "Watering" : "Next watering"}
        value={running ?? (data.nextRunAt ? formatWhenShortUtc(data.nextRunAt) : "Not scheduled")}
        title={
          running ??
          (!data.nextRunAt
            ? "No schedule for this zone"
            : paused
              ? `${formatWhenUtc(data.nextRunAt)} — skipped while the zone is paused`
              : formatWhenUtc(data.nextRunAt))
        }
        muted={!running && (!data.nextRunAt || paused)}
      />
      <Metric icon="bars" label="Water usage" value={formatLiters(data.litersToday)} />
      <Metric
        icon="leaf"
        label="Soil moisture"
        value={data.soilMoisture === null ? "No sensor" : `${Math.round(data.soilMoisture)}%`}
        muted={data.soilMoisture === null}
      />
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  title,
  muted,
}: {
  icon: IconName;
  label: string;
  value: string;
  title?: string;
  muted?: boolean;
}) {
  return (
    <div className="zmetric">
      <Icon name={icon} size={17} strokeWidth={1.7} className="zmetric__icon" />
      <div style={{ minWidth: 0 }}>
        <div className="zmetric__label">{label}</div>
        <div
          className={`zmetric__value${muted ? " zmetric__value--muted" : ""}`}
          title={title ?? value}
        >
          {value}
        </div>
      </div>
    </div>
  );
}


function zoneStatus(zone: Zone): { label: string; tone: "live" | "paused" | "active" } {
  if (!zone.enabled) return { label: "Paused", tone: "paused" };
  if (zone.active_run_id) return { label: "Watering", tone: "live" };
  return { label: "Active", tone: "active" };
}


function runningLabel(zone: Zone, now: number): string | null {
  if (!zone.active_run_id || !zone.started_at || !zone.duration_seconds) return null;
  const elapsed = (now - Date.parse(zone.started_at)) / 1000;
  return `${formatClock(Math.max(0, zone.duration_seconds - elapsed))} left`;
}

function ZoneCardSkeleton() {
  return (
    <div className="zcard">
      <div className="zcard__media skeleton" />
      <div className="zcard__body">
        <Skeleton height={17} width="52%" />
        <div style={{ height: 9 }} />
        <Skeleton height={12} width="70%" />
      </div>
      <div className="zcard__metrics">
        <Skeleton height={34} />
      </div>
    </div>
  );
}
