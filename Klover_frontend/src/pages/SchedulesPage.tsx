import { useState } from "react";
import { api, ApiError, ZONE } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { PageHead } from "../components/layout/AppShell";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  Modal,
  RowMenu,
  Skeleton,
  TextField,
  Toggle,
  useToast,
} from "../components/ui";
import { DAY_LABELS, WEEK_ORDER, formatDuration, padTime } from "../lib/format";
import type { Schedule, SchedulePayload } from "../api/types";
import "./SchedulesPage.css";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function parseDays(value: string): number[] {
  if (value.trim() === "*") return ALL_DAYS;
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function serializeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort();
  return sorted.length === 7 ? "*" : sorted.join(",");
}

function toPayload(schedule: Schedule): SchedulePayload {
  return {
    zone: schedule.zone,
    hour: schedule.hour,
    minute: schedule.minute,
    durationSeconds: schedule.duration_seconds,
    daysOfWeek: schedule.days_of_week,
    enabled: schedule.enabled,
  };
}

export function SchedulesPage() {
  const toast = useToast();
  const schedules = useAsync(() => api.schedules(), []);

  const [editing, setEditing] = useState<Schedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const list = schedules.data ?? [];

  async function toggleSchedule(schedule: Schedule, enabled: boolean) {
    setBusyId(schedule.id);
    try {
      await api.updateSchedule(schedule.id, { ...toPayload(schedule), enabled });
      toast(`Schedule ${enabled ? "enabled" : "paused"}.`);
      schedules.reload();
    } catch (cause) {
      toast(cause instanceof ApiError ? cause.message : "Could not update the schedule.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeSchedule(schedule: Schedule) {
    if (!window.confirm(`Delete the ${padTime(schedule.hour, schedule.minute)} schedule?`)) return;
    setBusyId(schedule.id);
    try {
      await api.deleteSchedule(schedule.id);
      toast("Schedule deleted.");
      schedules.reload();
    } catch (cause) {
      toast(cause instanceof ApiError ? cause.message : "Could not delete the schedule.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHead
        icon="calendar"
        title="Schedules"
        subtitle="Pick the time, the days and how long to water."
        actions={
          <Button variant="lime" icon="plus" onClick={() => setCreating(true)}>
            Add schedule
          </Button>
        }
      />

      {schedules.error ? <Alert tone="error">{schedules.error}</Alert> : null}

      {schedules.initial ? (
        <div className="sched__list">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="sched__row">
              <Skeleton height={44} />
            </Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState
            icon="calendar"
            title="No schedules yet"
            action={
              <Button variant="lime" icon="plus" onClick={() => setCreating(true)}>
                Add schedule
              </Button>
            }
          >
            Schedules water automatically at the time and days you choose.
          </EmptyState>
        </Card>
      ) : (
        <div className="sched__list">
          {list.map((schedule) => {
            const days = new Set(parseDays(schedule.days_of_week));
            return (
              <Card key={schedule.id} className="sched__row" data-off={!schedule.enabled}>
                <span className="sched__tile" aria-hidden="true">
                  <Icon name="leaf" size={21} />
                </span>

                <span className="sched__ident">
                  <span className="sched__name">{padTime(schedule.hour, schedule.minute)}</span>
                  <span className="sched__zone">Zone: {schedule.zone}</span>
                </span>

                <span className="sched__days" aria-label="Days this schedule runs">
                  {WEEK_ORDER.map((day) => (
                    <span key={day} className="sched__day" data-on={days.has(day)}>
                      {DAY_LABELS[day]}
                    </span>
                  ))}
                </span>

                <span className="sched__metrics">
                  <span className="sched__metric">
                    <Icon name="clock" size={17} />
                    {padTime(schedule.hour, schedule.minute)}
                  </span>
                  <span className="sched__metric">
                    <Icon name="droplet" size={17} />
                    {formatDuration(schedule.duration_seconds)}
                  </span>
                </span>

                <span className="sched__controls">
                  <Toggle
                    hideLabel
                    checked={schedule.enabled}
                    disabled={busyId === schedule.id}
                    label={`${schedule.enabled ? "Pause" : "Resume"} the ${padTime(schedule.hour, schedule.minute)} schedule`}
                    onChange={(next) => void toggleSchedule(schedule, next)}
                  />
                  <RowMenu
                    label={`Actions for the ${padTime(schedule.hour, schedule.minute)} schedule`}
                    items={[
                      { label: "Edit schedule", icon: "pencil", onSelect: () => setEditing(schedule) },
                      {
                        label: "Delete schedule",
                        icon: "close",
                        danger: true,
                        disabled: busyId === schedule.id,
                        onSelect: () => void removeSchedule(schedule),
                      },
                    ]}
                  />
                </span>
              </Card>
            );
          })}
        </div>
      )}

      <p className="sched__note">
        <Icon name="info" size={16} />
        Automatic runs are skipped when today's rain chance is 60% or higher; manual runs ignore the rain check.
      </p>

      {creating || editing ? (
        <ScheduleDialog
          schedule={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            schedules.reload();
          }}
        />
      ) : null}
    </>
  );
}

function ScheduleDialog({
  schedule,
  onClose,
  onSaved,
}: {
  schedule?: Schedule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [time, setTime] = useState(schedule ? padTime(schedule.hour, schedule.minute) : "06:30");
  const [days, setDays] = useState<number[]>(schedule ? parseDays(schedule.days_of_week) : ALL_DAYS);
  const [minutes, setMinutes] = useState(schedule ? String(Math.round(schedule.duration_seconds / 60)) : "10");
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  }

  async function save() {
    const [hourText, minuteText] = time.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const durationMinutes = Number(minutes);

    if (!time || !Number.isInteger(hour) || !Number.isInteger(minute)) return setError("Enter a valid time.");
    if (days.length === 0) return setError("Select at least one day.");
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 60)
      return setError("Duration must be between 1 and 60 minutes.");

    const payload: SchedulePayload = {
      zone: schedule?.zone ?? ZONE,
      hour,
      minute,
      durationSeconds: Math.round(durationMinutes * 60),
      daysOfWeek: serializeDays(days),
      enabled,
    };

    setBusy(true);
    setError(null);
    try {
      if (schedule) await api.updateSchedule(schedule.id, payload);
      else await api.createSchedule(payload);
      toast(schedule ? "Schedule updated." : "Schedule created.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save the schedule.");
      setBusy(false);
    }
  }

  return (
    <Modal
      size="lg"
      title={schedule ? "Edit schedule" : "Add schedule"}
      subtitle={`Zone: ${schedule?.zone ?? ZONE}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {schedule ? "Save changes" : "Create schedule"}
          </Button>
        </>
      }
    >
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <div className="form-row">
        <TextField label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <TextField
          label="Duration (minutes)"
          type="number"
          min="1"
          max="60"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <span className="field__label">Days</span>
        <div className="daypicker">
          {WEEK_ORDER.map((day) => (
            <button key={day} type="button" aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18, marginBottom: 4 }}>
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "Enabled" : "Paused"} />
      </div>
    </Modal>
  );
}
