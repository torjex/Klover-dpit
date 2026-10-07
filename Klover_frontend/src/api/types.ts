export interface LoginResponse {
  apiKey: string;
}

export interface WaterStatus {
  watering: boolean;
  remainingSeconds: number;
}


export interface WaterNowResult {
  zone: string;
  durationSeconds: number;
  litersUsed: number;
  startedAt: string;
}


export interface WaterStopResult {
  zone: string;
  status: string;
}

export type Period = "today" | "week" | "month" | "all";


export interface Consumption {
  period: Period;
  totalLiters: number;
  eventCount: number;
}


export interface ZoneConsumption {
  zone: string;
  totalLiters: number;
  eventCount: number;
}


export interface HistoryEvent {
  id: number;
  zone: string;
  started_at: string;
  duration_seconds: number;
  liters_used: number;
}


export interface RainChance {
  date: string;
  rainChancePercent: number | null;
  expectedMm: number | null;
}


export interface CurrentConditions {
  temperatureC: number | null;
  isRainingNow: boolean;
}

export interface SensorReading {
  distance_cm: number | null;
  soil_humidity_pct: number | null;
  air_temp_c: number | null;
  air_humidity_pct: number | null;
  receivedAt: string;
}

export interface Schedule {
  id: number;
  zone: string;
  hour: number;
  minute: number;
  duration_seconds: number;
  days_of_week: string;
  enabled: boolean;
}

export interface SchedulePayload {
  zone?: string;
  hour: number;
  minute: number;
  durationSeconds: number;
  daysOfWeek?: string;
  enabled?: boolean;
}
