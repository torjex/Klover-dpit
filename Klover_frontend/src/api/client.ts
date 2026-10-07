import type {
  Consumption,
  CurrentConditions,
  HistoryEvent,
  LoginResponse,
  Period,
  RainChance,
  Schedule,
  SchedulePayload,
  SensorReading,
  WaterNowResult,
  WaterStatus,
  WaterStopResult,
  ZoneConsumption,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";
const KEY_STORAGE = "klover.apiKey";

export const ZONE = "frontlawn";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}


export const SESSION_EXPIRED = "klover:session-expired";

export function readApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function writeApiKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage can be unavailable; the in-memory session still works */
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** Login must not trigger the global sign-out event. */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, anonymous } = options;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}))
    if (value !== undefined && value !== "") params.set(key, String(value));
  const qs = params.toString();
  const url = BASE + path + (qs ? `?${qs}` : "");

  const key = anonymous ? null : readApiKey();
  const response = await fetch(url, {
    method,
    signal,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "x-api-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(0, "Cannot reach the Klover backend. Is it running?");
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = undefined;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    if (response.status === 401 && !anonymous)
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    throw new ApiError(response.status, messageFrom(payload, response.status));
  }
  return payload as T;
}

function messageFrom(payload: unknown, status: number): string {
  const record = payload as { error?: unknown } | undefined;
  const raw = record?.error;
  if (typeof raw === "string" && raw) return raw;
  if (status === 401) return "Incorrect password.";
  return "Something went wrong. Please try again.";
}

export const api = {
  login: (password: string) =>
    request<LoginResponse>("/login", { method: "POST", body: { password }, anonymous: true }),

  waterNow: (durationSeconds: number, zone: string = ZONE) =>
    request<WaterNowResult>("/water/now", { method: "POST", body: { zone, durationSeconds } }),
  waterStop: (zone: string = ZONE) =>
    request<WaterStopResult>("/water/stop", { method: "POST", body: { zone } }),
  waterStatus: (zone: string = ZONE) =>
    request<WaterStatus>("/water/status", { query: { zone } }),

  sensors: (zone: string = ZONE) => request<SensorReading>("/sensors", { query: { zone } }),

  consumption: (period: Period) => request<Consumption>("/consumption", { query: { period } }),
  consumptionByZone: (period: Period) =>
    request<ZoneConsumption[]>("/consumption/by-zone", { query: { period } }),
  history: (limit = 20) => request<HistoryEvent[]>("/history", { query: { limit } }),

  rainChance: () => request<RainChance>("/weather/rain-chance"),
  currentConditions: () => request<CurrentConditions>("/weather/current"),

  schedules: () => request<Schedule[]>("/schedule"),
  createSchedule: (body: SchedulePayload) =>
    request<Schedule>("/schedule", { method: "POST", body }),
  updateSchedule: (id: number, body: SchedulePayload) =>
    request<Schedule>(`/schedule/${id}`, { method: "PUT", body }),
  deleteSchedule: (id: number) => request<{ status: string }>(`/schedule/${id}`, { method: "DELETE" }),
};
