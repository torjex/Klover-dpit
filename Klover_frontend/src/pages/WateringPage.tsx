import { useEffect, useState } from "react";
import { api, ApiError, ZONE } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { PageHead } from "../components/layout/AppShell";
import { Alert, Badge, Button, Card, Icon, Segmented } from "../components/ui";
import { formatClock, formatLiters } from "../lib/format";
import "./WateringPage.css";

const PRESETS = [5, 10, 15];
const FLOW_RATE_LPM = 8;

export function WateringPage() {
  const status = useAsync(() => api.waterStatus(), [], { intervalMs: 2_000 });

  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDurationSeconds, setActiveDurationSeconds] = useState<number | null>(null);

  const watering = status.data?.watering ?? false;
  const remaining = status.data?.remainingSeconds ?? 0;

  useEffect(() => {
    if (watering && activeDurationSeconds === null) setActiveDurationSeconds(remaining);
    if (!watering && activeDurationSeconds !== null) setActiveDurationSeconds(null);
  }, [watering]);

  useEffect(() => {
    if (watering && remaining <= 0) status.reload();
  }, [remaining]);

  const estimatedLiters = FLOW_RATE_LPM * minutes;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api.waterNow(minutes * 60);
      setActiveDurationSeconds(minutes * 60);
      status.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not start watering.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await api.waterStop();
      status.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not stop watering.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead icon="leaf" title="Watering control" subtitle="Start a manual run or stop one in progress." />

      {status.error ? <Alert tone="error">{status.error}</Alert> : null}

      <div className="watering">
        <Card className="watering__panel">
          <div className="watering__zone">
            <img className="watering__photo" src="/zone-lawn.jpg" alt="" />
            <div style={{ minWidth: 0 }}>
              <h2 className="watering__zone-name">{ZONE}</h2>
              <p className="watering__eyebrow">Manual watering</p>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <span className="field__label">Duration</span>
            <div className="watering__duration-row">
              <Segmented
                tone="lime"
                ariaLabel="Watering duration"
                value={String(minutes)}
                options={PRESETS.map((value) => ({ value: String(value), label: `${value} min` }))}
                onChange={(value) => setMinutes(Number(value))}
              />
              <div className="watering__custom">
                <input
                  className="input watering__custom-input"
                  type="number"
                  min={1}
                  max={60}
                  value={minutes}
                  aria-label="Custom duration in minutes"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next)) setMinutes(Math.min(60, Math.max(1, Math.round(next))));
                  }}
                />
                <span className="watering__stepper">
                  <button type="button" aria-label="Increase duration" onClick={() => setMinutes((v) => Math.min(60, v + 1))}>
                    <Icon name="chevron-down" size={13} strokeWidth={2.4} />
                  </button>
                  <button type="button" aria-label="Decrease duration" onClick={() => setMinutes((v) => Math.max(1, v - 1))}>
                    <Icon name="chevron-down" size={13} strokeWidth={2.4} />
                  </button>
                </span>
              </div>
              <span className="watering__unit">min</span>
            </div>
          </div>

          <div className="watering__divider" />

          <div className="watering__estimate-label">
            <Icon name="droplet" size={15} />
            Estimated volume
          </div>
          <div className="watering__estimate">{formatLiters(estimatedLiters)}</div>
          <div className="watering__estimate-sub">
            {FLOW_RATE_LPM.toFixed(1)} L/min × {minutes} min
          </div>

          {error ? (
            <div style={{ marginTop: 16 }}>
              <Alert tone="error">{error}</Alert>
            </div>
          ) : null}

          <div style={{ marginTop: 18 }}>
            <Button
              variant="lime"
              size="lg"
              block
              icon="play"
              className="watering__action"
              loading={busy && !watering}
              disabled={watering}
              onClick={() => void start()}
            >
              {watering ? "Already watering" : "Start watering"}
            </Button>
          </div>
        </Card>

        <Card className="watering__panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 19 }}>Currently running</h2>
              <p className="watering__eyebrow">{watering ? ZONE : "Nothing is watering"}</p>
            </div>
            {watering ? (
              <Badge tone="success" dot live>
                Running
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Idle
              </Badge>
            )}
          </div>

          {watering ? (
            <RunningPanel remaining={remaining} total={activeDurationSeconds ?? remaining} busy={busy} onStop={() => void stop()} />
          ) : (
            <p className="watering__eyebrow" style={{ marginTop: 16 }}>
              Start a manual run on the left, or wait for the next schedule.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function RunningPanel({
  remaining,
  total,
  busy,
  onStop,
}: {
  remaining: number;
  total: number;
  busy: boolean;
  onStop: () => void;
}) {
  const progress = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0;
  const circumference = 2 * Math.PI * RING_RADIUS;
  const left = 1 - progress / 100;

  return (
    <>
      <div className="watering__timer">
        <div className="wtimer">
          <svg className="wtimer__ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="wtimer__track" cx="60" cy="60" r={RING_RADIUS} />
            <circle
              className="wtimer__fill"
              cx="60"
              cy="60"
              r={RING_RADIUS}
              style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - left) }}
            />
          </svg>
          <div className="wtimer__inner">
            <Icon name="droplet" size={22} filled className="wtimer__drop" />
            <div className="watering__clock">{formatClock(remaining)}</div>
            <div className="watering__clock-label">remaining</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Button variant="danger" size="lg" block icon="stop" className="watering__action" loading={busy} onClick={onStop}>
          Stop watering
        </Button>
      </div>
    </>
  );
}

/** Radius of the countdown ring inside its 120-unit viewBox. */
const RING_RADIUS = 52;
