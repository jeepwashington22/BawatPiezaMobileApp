import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import { updatePowerModeNotification } from "../lib/push-notifications";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

/** Power source override chosen from Quick Overrides. `null` = Auto (no override). */
export type PowerOverride = "grid" | "battery" | "shutdown" | null;

type PowerOverrideContextValue = {
  override: PowerOverride;
  setOverride: (o: PowerOverride) => void;
  clearOverride: () => void;
  /** True while the user forced grid — dashboard shows green "Using Grid" state. */
  usingGrid: boolean;
  /** Single global sheet state — one modal for the whole app, no stacking. */
  overridesOpen: boolean;
  openOverrides: () => void;
  closeOverrides: () => void;
  smokeEmergencyActive: boolean;
  smokeEmergencyZone: string;
  gridUnavailableConfirmationOpen: boolean;
  confirmGridUnavailable: () => void;
  cancelGridUnavailable: () => void;
  assertPowerControlsAvailable: () => void;
};

const PowerOverrideContext = createContext<PowerOverrideContextValue | null>(
  null,
);

const STORAGE_KEY = "bawatpieza.power.override";
const SMOKE_EMERGENCY_STORAGE_KEY = "bawatpieza.smoke.emergency";
const HUB_STORAGE_KEY = "bawatpieza_hub_id";
const TELEMETRY_TOPIC_PREFIX = "bawatpieza/devices/";

async function sendPowerModeCommand(
  hubId: string,
  mode: Exclude<PowerOverride, null>,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");

  const response = await apiFetch(`/api/v1/telemetry/commands/${encodeURIComponent(hubId)}`, {
    method: "POST",
    timeoutMs: 10_000,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: `force_${mode}` }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(
      result?.message || result?.error || `Power-mode command failed (${response.status}).`,
    );
  }
}

function parse(raw: string | null): PowerOverride {
  if (raw === "grid" || raw === "battery" || raw === "shutdown") return raw;
  return null;
}

export function PowerOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<PowerOverride>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [gridAvailable, setGridAvailable] = useState<boolean | null>(null);
  const [gridUnavailableConfirmationOpen, setGridUnavailableConfirmationOpen] = useState(false);
  const [smokeEmergencyActive, setSmokeEmergencyActive] = useState(false);
  const [smokeEmergencyZone, setSmokeEmergencyZone] = useState("");
  const mqttClientRef = useRef<Paho.Client | null>(null);
  const hubIdRef = useRef<string | null>(null);
  const lastPowerModeEventByHubRef = useRef(new Map<string, string>());
  const overrideRef = useRef<PowerOverride>(null);
  const pendingOverrideRef = useRef<PowerOverride>(null);
  const userSelectedModeRef = useRef(false);
  const smokeEmergencyActiveRef = useRef(false);
  const smokeEmergencyZoneRef = useRef("");
  const smokeTelemetrySeenRef = useRef(false);
  const awaitingReportedModeRef = useRef<{
    mode: Exclude<PowerOverride, null>;
    expiresAt: number;
  } | null>(null);

  const assertPowerControlsAvailable = useCallback(() => {
    if (smokeEmergencyActiveRef.current) {
      throw new Error("Power controls are locked until the smoke alarm is reset at the hub.");
    }
  }, []);

  const updateSmokeEmergency = useCallback((active: boolean, zone: string) => {
    const nextZone = active ? zone : "";
    if (
      smokeEmergencyActiveRef.current === active &&
      smokeEmergencyZoneRef.current === nextZone
    ) {
      if (!active) {
        AsyncStorage.removeItem(SMOKE_EMERGENCY_STORAGE_KEY).catch((error) => {
          console.warn("[power-override] failed to clear smoke emergency state", error);
        });
      }
      return;
    }
    smokeEmergencyActiveRef.current = active;
    smokeEmergencyZoneRef.current = nextZone;
    setSmokeEmergencyActive(active);
    setSmokeEmergencyZone(nextZone);
    const persist = active
      ? AsyncStorage.setItem(SMOKE_EMERGENCY_STORAGE_KEY, nextZone)
      : AsyncStorage.removeItem(SMOKE_EMERGENCY_STORAGE_KEY);
    persist.catch((error) => {
      console.warn("[power-override] failed to persist smoke emergency state", error);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SMOKE_EMERGENCY_STORAGE_KEY)
      .then((savedZone) => {
        if (savedZone !== null && !smokeTelemetrySeenRef.current) {
          smokeEmergencyActiveRef.current = true;
          smokeEmergencyZoneRef.current = savedZone;
          setSmokeEmergencyActive(true);
          setSmokeEmergencyZone(savedZone);
        }
      })
      .catch((error) => {
        console.warn("[power-override] failed to load smoke emergency state", error);
      });
  }, []);

  useEffect(() => {
    let active = true;
    let activeHubId: string | null = null;
    let client: Paho.Client | null = null;
    let checkTimer: ReturnType<typeof setTimeout> | null = null;

    const connectForHub = (hubId: string) => {
      if (!active || hubId === activeHubId && client?.isConnected()) return;
      if (client?.isConnected()) client.disconnect();
      activeHubId = hubId;
      hubIdRef.current = hubId;

      const nextClient = new Paho.Client(
        "broker.hivemq.com",
        8884,
        `app-bg-${Math.random().toString(16).substring(2, 8)}`,
      );
      client = nextClient;
      mqttClientRef.current = nextClient;

      nextClient.onConnectionLost = () => {
        if (mqttClientRef.current === nextClient) {
          mqttClientRef.current = null;
        }
      };
      nextClient.onMessageArrived = (message: Paho.Message) => {
        try {
          const telemetry = JSON.parse(message.payloadString) as {
            power_mode?: unknown;
            previous_power_mode?: unknown;
            power_mode_event_id?: unknown;
            grid_ac_available?: unknown;
            smoke_alert?: unknown;
            smoke_zone?: unknown;
          };
          const gridAvailability = telemetry.grid_ac_available;
          if (
            gridAvailability === true ||
            gridAvailability === 1 ||
            gridAvailability === "1" ||
            gridAvailability === "true"
          ) {
            setGridAvailable(true);
          } else if (
            gridAvailability === false ||
            gridAvailability === 0 ||
            gridAvailability === "0" ||
            gridAvailability === "false"
          ) {
            setGridAvailable(false);
          }
          if (telemetry.smoke_alert !== undefined) {
            smokeTelemetrySeenRef.current = true;
            const smokeActive =
              telemetry.smoke_alert === true ||
              telemetry.smoke_alert === 1 ||
              telemetry.smoke_alert === "1" ||
              telemetry.smoke_alert === "true";
            updateSmokeEmergency(
              smokeActive,
              typeof telemetry.smoke_zone === "string" ? telemetry.smoke_zone : "",
            );
            if (smokeActive) {
              pendingOverrideRef.current = null;
              awaitingReportedModeRef.current = null;
            }
          }
          const reportedMode = parse(
            typeof telemetry.power_mode === "string" ? telemetry.power_mode : null,
          );
          if (reportedMode) {
            const previousMode = parse(
              typeof telemetry.previous_power_mode === "string"
                ? telemetry.previous_power_mode
                : null,
            );
            const eventId = typeof telemetry.power_mode_event_id === "string"
              ? telemetry.power_mode_event_id.trim()
              : "";
            const activeHubId = hubIdRef.current;
            if (activeHubId && eventId) {
              const lastEventId = lastPowerModeEventByHubRef.current.get(activeHubId);
              lastPowerModeEventByHubRef.current.set(activeHubId, eventId);
              if (lastEventId && lastEventId !== eventId && previousMode && previousMode !== reportedMode) {
                updatePowerModeNotification(activeHubId, eventId, previousMode, reportedMode);
              }
            }
            const awaiting = awaitingReportedModeRef.current;
            if (awaiting && reportedMode !== awaiting.mode) {
              if (Date.now() < awaiting.expiresAt) return;
              awaitingReportedModeRef.current = null;
            } else if (awaiting) {
              awaitingReportedModeRef.current = null;
            }
            overrideRef.current = reportedMode;
            setOverrideState(reportedMode);
            AsyncStorage.setItem(STORAGE_KEY, reportedMode).catch((error) => {
              console.warn("[power-override] failed to save reported mode", error);
            });
          }
        } catch (error) {
          console.warn("[power-override] failed to parse hub telemetry", error);
        }
      };

      nextClient.connect({
        useSSL: true,
        keepAliveInterval: 30,
        onSuccess: () => {
          if (!active || hubIdRef.current !== hubId) return;
          nextClient.subscribe(`${TELEMETRY_TOPIC_PREFIX}${hubId}/telemetry`);
          const pending = pendingOverrideRef.current;
          if (pending && !smokeEmergencyActiveRef.current) {
            void sendPowerModeCommand(hubId, pending)
              .then(() => {
                if (pendingOverrideRef.current === pending) pendingOverrideRef.current = null;
              })
              .catch((error) => {
                console.error("[power-override] failed to send queued mode command", error);
              });
          }
          console.log("background mqtt connected and subscribed to device telemetry");
        },
        onFailure: (error) => {
          console.warn("[power-override] background MQTT connection failed", error);
        },
      });
    };

    const checkDevice = async () => {
      try {
        const hubId = await AsyncStorage.getItem(HUB_STORAGE_KEY);
        if (!active) return;
        if (hubId && (hubId !== activeHubId || !client?.isConnected())) {
          connectForHub(hubId);
        } else if (!hubId && activeHubId) {
          if (client?.isConnected()) client.disconnect();
          client = null;
          activeHubId = null;
          hubIdRef.current = null;
          mqttClientRef.current = null;
          pendingOverrideRef.current = null;
        }
      } catch (error) {
        console.warn("[power-override] failed to resolve paired device", error);
      }
      if (active) checkTimer = setTimeout(() => void checkDevice(), 3000);
    };

    void checkDevice();

    return () => {
      active = false;
      if (checkTimer) clearTimeout(checkTimer);
      if (client && client.isConnected()) {
        client.disconnect();
      }
      mqttClientRef.current = null;
    };
  }, [updateSmokeEmergency]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const parsed = parse(saved);
        if (
          parsed &&
          !userSelectedModeRef.current &&
          overrideRef.current === null
        ) {
          overrideRef.current = parsed;
          setOverrideState(parsed);
        }
      })
      .catch((error) => {
        console.warn("[power-override] failed to load saved mode", error);
      });
  }, []);

  const applyOverride = useCallback(async (o: PowerOverride) => {
    try {
      assertPowerControlsAvailable();
    } catch {
      console.warn("[power-override] rejected mode change during smoke emergency");
      return;
    }
    userSelectedModeRef.current = true;
    overrideRef.current = o;
    setOverrideState(o);

    const persistMode = o
      ? AsyncStorage.setItem(STORAGE_KEY, o)
      : AsyncStorage.removeItem(STORAGE_KEY);
    persistMode.catch((error) => {
      console.warn("[power-override] failed to save selected mode", error);
    });

    if (!o) return;
    awaitingReportedModeRef.current = {
      mode: o,
      expiresAt: Date.now() + 8000,
    };
    const client = mqttClientRef.current;
    const hubId = hubIdRef.current;
    if (!client?.isConnected() || !hubId) {
      pendingOverrideRef.current = o;
      return;
    }

    void sendPowerModeCommand(hubId, o)
      .then(() => {
        if (pendingOverrideRef.current === o) pendingOverrideRef.current = null;
      })
      .catch((error) => {
      pendingOverrideRef.current = o;
      console.error("[power-override] failed to send mode to device", error);
      });
  }, [assertPowerControlsAvailable]);

  const setOverride = useCallback(async (o: PowerOverride) => {
    if (o === "grid" && gridAvailable === false) {
      setGridUnavailableConfirmationOpen(true);
      return;
    }
    await applyOverride(o);
  }, [applyOverride, gridAvailable]);

  const confirmGridUnavailable = useCallback(() => {
    setGridUnavailableConfirmationOpen(false);
    void applyOverride("grid");
  }, [applyOverride]);

  const cancelGridUnavailable = useCallback(() => {
    setGridUnavailableConfirmationOpen(false);
  }, []);

  const clearOverride = useCallback(() => setOverride(null), [setOverride]);

  const openOverrides = useCallback(() => setOverridesOpen(true), []);
  const closeOverrides = useCallback(() => setOverridesOpen(false), []);

  const value = useMemo<PowerOverrideContextValue>(
    () => ({
      override,
      setOverride,
      clearOverride,
      usingGrid: override === "grid" || override === null,
      overridesOpen,
      openOverrides,
      closeOverrides,
      smokeEmergencyActive,
      smokeEmergencyZone,
      gridUnavailableConfirmationOpen,
      confirmGridUnavailable,
      cancelGridUnavailable,
      assertPowerControlsAvailable,
    }),
    [
      override,
      setOverride,
      clearOverride,
      overridesOpen,
      openOverrides,
      closeOverrides,
      smokeEmergencyActive,
      smokeEmergencyZone,
      gridUnavailableConfirmationOpen,
      confirmGridUnavailable,
      cancelGridUnavailable,
      assertPowerControlsAvailable,
    ],
  );

  return (
    <PowerOverrideContext.Provider value={value}>
      {children}
    </PowerOverrideContext.Provider>
  );
}

export function usePowerOverride(): PowerOverrideContextValue {
  const ctx = useContext(PowerOverrideContext);
  if (!ctx)
    throw new Error(
      "usePowerOverride must be used inside <PowerOverrideProvider>",
    );
  return ctx;
}
