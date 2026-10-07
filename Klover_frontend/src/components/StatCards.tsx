import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Icon, Skeleton } from "./ui";
import { formatLiters } from "../lib/format";
import "./StatCards.css";


function StatCard({
  to,
  title,
  badge,
  badgeTone,
  value,
  sub,
  foot,
  art,
}: {
  to: string;
  title: string;
  badge: ReactNode;
  badgeTone?: "blue";
  value: ReactNode;
  sub?: ReactNode;
  foot?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <Link to={to} className="ovc" aria-label={title}>
      {art}
      <div className="ovc__main">
        <span className={`ovc__badge${badgeTone === "blue" ? " ovc__badge--blue" : ""}`}>
          {badge}
        </span>
        <div className="ovc__body">
          <div className="ovc__title-row">
            <span className="ovc__title">{title}</span>
            <Icon name="chevron-right" size={18} strokeWidth={2} className="ovc__chevron" />
          </div>
          {value}
          {sub}
        </div>
      </div>
      {foot ? <div className="ovc__foot">{foot}</div> : null}
    </Link>
  );
}


export function ActiveZonesCard({
  active,
  total,
}: {
  active: number;
  total: number;
}) {
  const leaves = Math.min(total, 8);
  return (
    <StatCard
      to="/zones"
      title="Active zones"
      badge={<LeafGlyph size={22} />}
      art={<LeafWatermark />}
      value={
        <div className="ovc__value">
          {active}
          <span className="ovc__total">/ {total}</span>
        </div>
      }
      sub={
        <span className="ovc__sub">
          <span className={`ovc__dot${active === 0 ? " ovc__dot--idle" : ""}`} />
          {total === 0
            ? "No zones configured"
            : active === total
              ? "All systems normal"
              : `${total - active} disabled`}
        </span>
      }
      foot={
        <div className="ovc__leaves" aria-hidden="true">
          {Array.from({ length: leaves }, (_, index) => (
            <LeafGlyph
              key={index}
              size={18}
              className={`ovc__leaf${index < active ? "" : " ovc__leaf--off"}`}
            />
          ))}
        </div>
      }
    />
  );
}


export function WaterUsageCard({
  liters,
  trend,
  series,
}: {
  liters: number;
  trend: { text: string; direction: "up" | "down" | "flat" };
  /** Recent daily totals, oldest first; the last entry is today. */
  series: number[];
}) {
  const peak = Math.max(1, ...series);
  return (
    <StatCard
      to="/activity"
      title="Water usage"
      badgeTone="blue"
      badge={<Icon name="droplet" size={22} filled />}
      value={<div className="ovc__value">{formatLiters(liters)}</div>}
      sub={
        trend.direction === "flat" ? (
          <span className="ovc__sub">{trend.text}</span>
        ) : (
          <span className="ovc__sub">
            <span className={`ovc__delta ovc__delta--${trend.direction}`}>
              <Icon
                name={trend.direction === "down" ? "arrow-down" : "arrow-up"}
                size={14}
                strokeWidth={2.4}
                style={{ verticalAlign: "-2px", marginRight: 3 }}
              />
              {trend.text.replace(" vs yesterday", "")}
            </span>
            vs yesterday
          </span>
        )
      }
      foot={
        <div className="ovc__spark-row">
          <div className="ovc__spark" aria-hidden="true">
            {series.map((value, index) => {
              const ratio = value / peak;
              const tone =
                index === series.length - 1 ? "strong" : ratio >= 0.62 ? "mid" : "light";
              return (
                <span
                  key={index}
                  data-tone={tone}
                  style={{ height: `${Math.max(8, ratio * 100)}%` }}
                />
              );
            })}
          </div>
          <span className="ovc__spark-label">Est. today</span>
        </div>
      }
    />
  );
}


export function RainProbabilityCard({
  percent,
  unavailable,
}: {
  percent: number;
  unavailable?: boolean;
}) {
  return (
    <StatCard
      to="/weather"
      title="Rain probability"
      badge={<Icon name="rain" size={22} strokeWidth={1.8} />}
      value={<div className="ovc__value">{unavailable ? "—" : `${Math.round(percent)}%`}</div>}
      sub={<span className="ovc__sub">{unavailable ? "Forecast unavailable" : "Next 24 hours"}</span>}
      foot={
        <>
          <div
            className="ovc__meter"
            role="img"
            aria-label={
              unavailable ? "Forecast unavailable" : `${Math.round(percent)} percent rain probability`
            }
          >
            <span style={{ width: `${unavailable ? 0 : Math.min(100, Math.max(0, percent))}%` }} />
          </div>
          <div className="ovc__meter-scale" aria-hidden="true">
            <span>0%</span>
            <span>100%</span>
          </div>
        </>
      }
    />
  );
}


export function NextScheduleCard({
  day,
  time,
  name,
}: {
  day: string | null;
  time: string | null;
  name: string;
}) {
  return (
    <StatCard
      to="/schedules"
      title="Next schedule"
      badge={<Icon name="calendar" size={21} strokeWidth={1.8} />}
      art={<SunLeafArt />}
      value={
        day && time ? (
          <div className="ovc__value ovc__value--stack">
            {day}
            <br />
            {time} UTC
          </div>
        ) : (
          <div className="ovc__value">None</div>
        )
      }
      sub={
        <span className="ovc__sub">
          <Icon name="clock" size={15} style={{ color: "var(--ovc-green)" }} />
          {name}
        </span>
      }
    />
  );
}


export function StatCardSkeleton() {
  return (
    <div className="ovc ovc--loading">
      <div className="ovc__main">
        <Skeleton height={46} width={46} radius={23} />
        <div style={{ flex: 1 }}>
          <Skeleton height={13} width="58%" />
          <div style={{ height: 14 }} />
          <Skeleton height={28} width="45%" />
          <div style={{ height: 10 }} />
          <Skeleton height={12} width="70%" />
        </div>
      </div>
      <div className="ovc__foot">
        <Skeleton height={22} width="60%" />
      </div>
    </div>
  );
}


function LeafGlyph({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d="M20.4 3.2c-7.6.5-12.4 2.6-14.7 6.1-2.1 3.2-1.3 6.9.6 8.6.5-2.4 1.7-4.6 3.5-6.4 1.6-1.6 3.5-2.8 5.6-3.5-3.6 2.3-6.3 5.6-7.4 9.7l-.5 2c-.1.6.2 1.1.8 1.2.6.1 1.1-.2 1.2-.8l.4-1.7c8.4-.4 12-5.6 10.5-15.2Z" />
    </svg>
  );
}

/** Faint leaf watermark in the lower-right of the active-zones card. */
function LeafWatermark() {
  return (
    <svg
      className="ovc__art"
      width="112"
      height="106"
      viewBox="0 0 128 122"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(30 14) rotate(12 50 50)">
        {/* A leaf blade: two mirrored arcs meeting at the tip and the stem. */}
        <path
          d="M4 104C4 50 50 4 104 4c0 54-46 100-100 100Z"
          fill="#edf8f1"
        />
        <path d="M4 104 104 4" stroke="#dcf0e4" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M30 84c10-6 18-16 22-28M52 62c10-6 18-16 22-28"
          stroke="#dcf0e4"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Soft sun and foliage in the lower-right of the next-schedule card. */
function SunLeafArt() {
  return (
    <svg
      className="ovc__art ovc__art--sun"
      width="124"
      height="112"
      viewBox="0 0 150 136"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="ovcSun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fce6a8" />
          <stop offset="62%" stopColor="#fdefc9" />
          <stop offset="100%" stopColor="#fdf6e6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ovcLeafBack" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cdeedb" />
          <stop offset="100%" stopColor="#a9e0c0" />
        </linearGradient>
        <linearGradient id="ovcLeafFront" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7fd3a3" />
          <stop offset="100%" stopColor="#4fbf82" />
        </linearGradient>
      </defs>

      <circle cx="108" cy="44" r="38" fill="url(#ovcSun)" />

      {/* Back leaf, tilted away from the card corner. */}
      <g transform="translate(60 52) rotate(-18 40 40)">
        <path d="M3 77C3 36 36 3 77 3c0 41-33 74-74 74Z" fill="url(#ovcLeafBack)" />
        <path d="M3 77 77 3" stroke="#e7f7ee" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Front leaf, overlapping and darker for depth. */}
      <g transform="translate(86 62) rotate(14 34 34)">
        <path d="M3 65C3 31 31 3 65 3c0 34-28 62-62 62Z" fill="url(#ovcLeafFront)" />
        <path d="M3 65 65 3" stroke="#dcf4e7" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M20 52c8-4 14-12 17-22M36 40c8-4 14-12 17-22"
          stroke="#dcf4e7"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.75"
        />
      </g>
      <path
        d="M108 96c0 3.4-2.6 6.2-5.8 6.2s-5.8-2.8-5.8-6.2c0-3.3 3.4-7.2 5.8-9.3 2.4 2.1 5.8 6 5.8 9.3Z"
        fill="#dff0fd"
        opacity="0.95"
      />
    </svg>
  );
}
