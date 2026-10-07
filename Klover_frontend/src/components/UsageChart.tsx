import { useMemo } from "react";
import { formatLiters } from "../lib/format";

export const SERIES_COLORS = [
  "#1f7a52",
  "#8bbf3d",
  "#d3c04a",
  "#4aa3a0",
  "#6b7f2f",
  "#2f5d7c",
];

export interface Bucket {
  label: string;
  showLabel: boolean;
  byZone: Map<string, number>;
}

export interface Series {
  id: string;
  name: string;
  color: string;
  liters: number;
}

export function UsageChart({
  buckets,
  series,
  totalLiters,
}: {
  buckets: Bucket[];
  series: Series[];
  totalLiters: number;
}) {
  const max = useMemo(() => {
    const peak = Math.max(
      0,
      ...buckets.map((bucket) => [...bucket.byZone.values()].reduce((a, b) => a + b, 0)),
    );
    return peak > 0 ? niceCeiling(peak) : 60;
  }, [buckets]);

  const ticks = [max, (max * 2) / 3, max / 3, 0];

  if (totalLiters <= 0)
    return <div className="chart__empty">No watering recorded for this period yet.</div>;

  return (
    <div className="chart">
      <div className="chart__axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick}>{Math.round(tick)} L</span>
        ))}
      </div>

      <div className="chart__plot">
        <div className="chart__grid" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} />
          ))}
        </div>

        <div className="chart__bars" role="img" aria-label={`Water use by period, total ${formatLiters(totalLiters)}`}>
          {buckets.map((bucket, index) => {
            const total = [...bucket.byZone.values()].reduce((a, b) => a + b, 0);
            return (
              <div
                key={index}
                className="chart__bar"
                title={total > 0 ? `${bucket.label}: ${formatLiters(total)}` : undefined}
              >
                {series.map((entry) => {
                  const liters = bucket.byZone.get(entry.id) ?? 0;
                  if (liters <= 0) return null;
                  return (
                    <span
                      key={entry.id}
                      className="chart__seg"
                      style={{
                        height: `${(liters / max) * 100}%`,
                        background: entry.color,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="chart__labels" aria-hidden="true">
          {buckets.map((bucket, index) => (
            <span key={index} className="chart__label">
              {bucket.showLabel ? bucket.label : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="chart__legend">
        {series.map((entry) => (
          <span key={entry.id} className="chart__legend-item">
            <span className="chart__swatch" style={{ background: entry.color }} />
            {entry.name}
            <span className="chart__legend-share">
              {formatLiters(entry.liters)} ({Math.round((entry.liters / totalLiters) * 100)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 3, 5, 7.5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return magnitude * 10;
}
