import { apiFetch } from "./api";
import { supabase } from "./supabase";

export type HardwareTestSettings = {
  enabled: boolean;
  simulated_at: string;
  battery_percentage: number;
  updated_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHardwareTestSettings(value: unknown): value is HardwareTestSettings {
  if (!isRecord(value)) return false;
  return (
    typeof value.enabled === "boolean" &&
    typeof value.simulated_at === "string" &&
    Number.isFinite(Date.parse(value.simulated_at)) &&
    typeof value.battery_percentage === "number" &&
    Number.isFinite(value.battery_percentage) &&
    value.battery_percentage >= 0 &&
    value.battery_percentage <= 100 &&
    typeof value.updated_at === "string" &&
    Number.isFinite(Date.parse(value.updated_at))
  );
}

export function getApplicationDate(
  settings: HardwareTestSettings | null,
  nowMs = Date.now(),
) {
  if (settings?.enabled) {
    const simulatedAt = Date.parse(settings.simulated_at);
    const updatedAt = Date.parse(settings.updated_at);
    if (Number.isFinite(simulatedAt) && Number.isFinite(updatedAt)) {
      return new Date(simulatedAt + Math.max(0, nowMs - updatedAt));
    }
  }
  return new Date(nowMs);
}

export async function fetchHardwareTestSettings(): Promise<HardwareTestSettings> {
  const { data: authData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = authData.session?.access_token;
  if (!token) throw new Error("Sign in to load admin hardware test settings.");

  const response = await apiFetch("/api/v1/public/hardware-test-settings", {
    headers: { Authorization: `Bearer ${token}` },
    cacheTtlMs: 0,
    timeoutMs: 8_000,
  });
  if (!response.ok) {
    throw new Error(
      `Hardware test settings request failed with status ${response.status}.`,
    );
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !isHardwareTestSettings(body.settings)) {
    throw new Error("The hardware test settings response is invalid.");
  }
  return body.settings;
}
