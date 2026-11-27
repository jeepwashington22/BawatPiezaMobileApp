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
import {
  updatePowerModeNotification,
  updateShortCircuitAlarm,
} from "../lib/push-notifications";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import {
  forceStopSystemAllocation,
} from "../lib/system-allocation-runtime";
import { loadSystemAllocationStatus } from "../lib/system-allocation-status";

/** Power source override chosen from Quick Overrides. `null` = Auto (no override). */
export type PowerOverride = "grid" | "battery" | "shutdown" | null;

type PowerOverrideContextValue = {
  override: PowerOverride;
  /**
   * Mode the user just picked that the hub has not confirmed yet. Screens should
   * render this immediately (optimistic UI) instead of waiting for telemetry.
   * Clears when the hub confirms, when sending fails, or after the timeout.
   */
  pendingMode: Exclude<PowerOverride, null> | null;
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
  shortCircuitActive: boolean;
  shortCircuitZone: string;
  gridUnavailableConfirmationOpen: boolean;
  cancelGridUnavailable: () => void;
  shutdownConfirmationOpen: boolean;
  shutdownConfirmationPercentage: number | null;
  confirmShutdown: () => void;
  cancelShutdown: () => void;
  assertPowerControlsAvailable: () => void;
  runWithAllocationInterlock: (
    actionLabel: string,
    action: () => Promise<void>,
  ) => Promise<void>;
  allocationStopConfirmationOpen: boolean;
  allocationStopActionLabel: string;
  allocationStopError: string;
  allocationStopInProgress: boolean;
  confirmAllocationForceStop: () => Promise<void>;
  cancelAllocationForceStop: () => void;
  ensureBatteryUsable: () => boolean;
  batteryReservePercentage: number | null;
  dismissBatteryReserveWarning: () => void;
};

const PowerOverrideContext = createContext<PowerOverrideContextValue | null>(
  null,
);

const STORAGE_KEY = "bawatpieza.power.override";
const SMOKE_EMERGENCY_STORAGE_KEY = "bawatpieza.smoke.emergency";
const SHORT_CIRCUIT_STORAGE_KEY = "bawatpieza.short-circuit.emergency";
const HUB_STORAGE_KEY = "bawatpieza_hub_id";
const TELEMETRY_TOPIC_PREFIX = "bawatpieza/devices/";
/** How long the optimistic mode is trusted while waiting for the hub to confirm. */
const PENDING_CONFIRM_MS = 8000;
/**
 * Publish the force_* command straight over the MQTT connection that is already
 * open (same topic/shape the dashboard uses for room relays) so the hub reacts
 * immediately, while the HTTP command still goes out in parallel as the
 * authoritative/fallback path. Set to false to use HTTP only.
 */
const DIRECT_MQTT_FAST_PATH = true;

function createPowerModeCommand(mode: Exclude<PowerOverride, null>) {
  return {
    command: `force_${mode}`,
    ...(mode === "grid" ? { manual_override: true } : {}),
  };
}

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
    body: JSON.stringify(createPowerModeCommand(mode)),
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
  const [pendingMode, setPendingMode] = useState<Exclude<PowerOverride, null> | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [allocationStopConfirmationOpen, setAllocationStopConfirmationOpen] =
    useState(false);
  const [allocationStopActionLabel, setAllocationStopActionLabel] = useState("");
  const [allocationStopError, setAllocationStopError] = useState("");
  const [allocationStopInProgress, setAllocationStopInProgress] =
    useState(false);
  const [gridAvailable, setGridAvailable] = useState<boolean | null>(null);
  const [gridUnavailableConfirmationOpen, setGridUnavailableConfirmationOpen] = useState(false);
  const [shutdownConfirmationOpen, setShutdownConfirmationOpen] = useState(false);
  const [shutdownConfirmationPercentage, setShutdownConfirmationPercentage] =
    useState<number | null>(null);
  const [smokeEmergencyActive, setSmokeEmergencyActive] = useState(false);
  const [smokeEmergencyZone, setSmokeEmergencyZone] = useState("");
  const [shortCircuitActive, setShortCircuitActive] = useState(false);
  const [shortCircuitZone, setShortCircuitZone] = useState("");
  const [batteryReservePercentage, setBatteryReservePercentage] = useState<number | null>(null);
  const mqttClientRef = useRef<Paho.Client | null>(null);
  const hubIdRef = useRef<string | null>(null);
  const lastPowerModeEventByHubRef = useRef(new Map<string, string>());
  const overrideRef = useRef<PowerOverride>(null);
  const pendingOverrideRef = useRef<PowerOverride>(null);
  const pendingAllocationActionRef = useRef<(() => Promise<void>) | null>(null);
  const allocationStopConfirmedRef = useRef(false);
  const userSelectedModeRef = useRef(false);
  const liveBatteryPercentageRef = useRef<number | null>(null);
  const testBatteryPercentageRef = useRef<number | null>(null);
  const smokeEmergencyActiveRef = useRef(false);
  const smokeEmergencyZoneRef = useRef("");
  const smokeTelemetrySeenRef = useRef(false);
  const shortCircuitActiveRef = useRef(false);
  const shortCircuitZoneRef = useRef("");
  const shortCircuitTelemetrySeenRef = useRef(false);
  const awaitingReportedModeRef = useRef<{
    mode: Exclude<PowerOverride, null>;
    expiresAt: number;
  } | null>(null);

  const clearPendingMode = useCallback(() => {
    awaitingReportedModeRef.current = null;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setPendingMode(null);
  }, []);

  const startPendingMode = useCallback((mode: Exclude<PowerOverride, null>) => {
    awaitingReportedModeRef.current = {
      mode,
      expiresAt: Date.now() + PENDING_CONFIRM_MS,
    };
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    setPendingMode(mode);
    // If the hub never confirms, fall back to whatever it actually reports.
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      if (awaitingReportedModeRef.current?.mode === mode) {
        awaitingReportedModeRef.current = null;
      }
      setPendingMode((current) => (current === mode ? null : current));
    }, PENDING_CONFIRM_MS);
  }, []);

  useEffect(
    () => () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    },
    [],
  );

  const assertPowerControlsAvailable = useCallback(() => {
    if (smokeEmergencyActiveRef.current) {
      throw new Error("Power controls are locked until the smoke alarm is reset at the hub.");
    }
    if (shortCircuitActiveRef.current) {
      throw new Error("Power controls are locked until the short circuit is checked and reset at the hub.");
    }
  }, []);

  const ensureBatteryUsable = useCallback(() => {
    const batteryPercentage =
      testBatteryPercentageRef.current ?? liveBatteryPercentageRef.current;
    if (batteryPercentage === null || batteryPercentage > 20) return true;

    setBatteryReservePercentage(batteryPercentage);
    return false;
  }, []);

  const updateShortCircuitEmergency = useCallback((active: boolean, zone: string) => {
    const nextZone = active ? zone : "";
    if (
      shortCircuitActiveRef.current === active &&
      shortCircuitZoneRef.current === nextZone
    ) {
      if (!active) {
        AsyncStorage.removeItem(SHORT_CIRCUIT_STORAGE_KEY).catch((error) => {
          console.warn("[power-override] failed to clear short-circuit emergency state", error);
        });
      }
      return;
    }
    shortCircuitActiveRef.current = active;
    shortCircuitZoneRef.current = nextZone;
    setShortCircuitActive(active);
    setShortCircuitZone(nextZone);
    const persist = active
      ? AsyncStorage.setItem(SHORT_CIRCUIT_STORAGE_KEY, nextZone)
      : AsyncStorage.removeItem(SHORT_CIRCUIT_STORAGE_KEY);
    persist.catch((error) => {
      console.warn("[power-override] failed to persist short-circuit emergency state", error);
    });
  }, []);

  const dismissBatteryReserveWarning = useCallback(() => {
    setBatteryReservePercentage(null);
  }, []);

  const runWithAllocationInterlock = useCallback(
    async (actionLabel: string, action: () => Promise<void>) => {
      if (pendingAllocationActionRef.current) {
        throw new Error("Confirm or cancel the current allocation stop first.");
      }
      const hubId = await AsyncStorage.getItem(HUB_STORAGE_KEY);
      if (!hubId) {
        await action();
        return;
      }
      const allocation = await loadSystemAllocationStatus(hubId);
      if (!allocation) {
        await action();
        return;
      }
      pendingAllocationActionRef.current = action;
      setAllocationStopActionLabel(actionLabel);
      setAllocationStopError("");
      setAllocationStopConfirmationOpen(true);
    },
    [],
  );

  const cancelAllocationForceStop = useCallback(() => {
    if (allocationStopInProgress) return;
    pendingAllocationActionRef.current = null;
    setAllocationStopError("");
    setAllocationStopConfirmationOpen(false);
  }, [allocationStopInProgress]);

  const confirmAllocationForceStop = useCallback(async () => {
    const pendingAction = pendingAllocationActionRef.current;
    if (!pendingAction || allocationStopInProgress) return;
    setAllocationStopInProgress(true);
    setAllocationStopError("");
    try {
      const hubId = await AsyncStorage.getItem(HUB_STORAGE_KEY);
      if (!hubId) throw new Error("Paired hub is unavailable.");
      const allocation = await loadSystemAllocationStatus(hubId);
      if (allocation) {
        await forceStopSystemAllocation(hubId, allocation.rooms);
      }
      pendingAllocationActionRef.current = null;
      setAllocationStopConfirmationOpen(false);
      allocationStopConfirmedRef.current = true;
      try {
        await pendingAction();
      } finally {
        allocationStopConfirmedRef.current = false;
      }
    } catch (error) {
      setAllocationStopError(
        error instanceof Error
          ? error.message
          : "Could not force-stop the system allocation.",
      );
    } finally {
      setAllocationStopInProgress(false);
    }
  }, [allocationStopInProgress]);

  useEffect(() => {
    AsyncStorage.getItem(SHORT_CIRCUIT_STORAGE_KEY)
      .then((savedZone) => {
        if (savedZone !== null && !shortCircuitTelemetrySeenRef.current) {
          shortCircuitActiveRef.current = true;
          shortCircuitZoneRef.current = savedZone;
          setShortCircuitActive(true);
          setShortCircuitZone(savedZone);
        }
      })
      .catch((error) => {
        console.warn("[power-override] failed to load short-circuit emergency state", error);
      });
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
            bat_pct?: unknown;
            grid_ac_available?: unknown;
            grid_in_v?: unknown;
            smoke_alert?: unknown;
            smoke_zone?: unknown;
            short_alert?: unknown;
            short_zone?: unknown;
            short_event_id?: unknown;
          };
          const rawBatteryPercentage = telemetry.bat_pct;
          const batteryPercentage =
            (typeof rawBatteryPercentage === "number" ||
              typeof rawBatteryPercentage === "string") &&
            String(rawBatteryPercentage).trim() !== ""
              ? Number(rawBatteryPercentage)
              : Number.NaN;
          if (
            Number.isFinite(batteryPercentage) &&
            batteryPercentage >= 0 &&
            batteryPercentage <= 100
          ) {
            liveBatteryPercentageRef.current = batteryPercentage;
          }
          const gridAvailability = telemetry.grid_ac_available;
          if (
            gridAvailability === true ||
            gridAvailability === 1 ||
            gridAvailability === "1" ||
            gridAvailability === "true"
          ) {
            setGridAvailable(true);
            setGridUnavailableConfirmationOpen(false);
          } else if (
            gridAvailability === false ||
            gridAvailability === 0 ||
            gridAvailability === "0" ||
            gridAvailability === "false"
          ) {
            setGridAvailable(false);
          } else {
            const rawGridInputVoltage = telemetry.grid_in_v;
            const gridInputVoltage =
              (typeof rawGridInputVoltage === "number" ||
                typeof rawGridInputVoltage === "string") &&
              String(rawGridInputVoltage).trim() !== ""
                ? Number(rawGridInputVoltage)
                : Number.NaN;
            if (Number.isFinite(gridInputVoltage) && gridInputVoltage >= 0) {
              const isGridAvailable = gridInputVoltage >= 50;
              setGridAvailable(isGridAvailable);
              if (isGridAvailable) setGridUnavailableConfirmationOpen(false);
            }
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
              clearPendingMode();
            }
          }
          if (telemetry.short_alert !== undefined) {
            shortCircuitTelemetrySeenRef.current = true;
            const shortActive =
              telemetry.short_alert === true ||
              telemetry.short_alert === 1 ||
              telemetry.short_alert === "1" ||
              telemetry.short_alert === "true";
            const zone =
              typeof telemetry.short_zone === "string" ? telemetry.short_zone : "";
            updateShortCircuitEmergency(shortActive, zone);
            if (shortActive) {
              pendingOverrideRef.current = null;
              clearPendingMode();
              updateShortCircuitAlarm(
                true,
                zone,
                hubId,
                typeof telemetry.short_event_id === "string"
                  ? telemetry.short_event_id.trim()
                  : "",
              );
            } else {
              updateShortCircuitAlarm(false);
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
              clearPendingMode();
            } else if (awaiting) {
              // Hub confirmed the mode the user picked -> drop the optimistic flag.
              clearPendingMode();
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
          if (
            pending &&
            !smokeEmergencyActiveRef.current &&
            !shortCircuitActiveRef.current
          ) {
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
  }, [updateSmokeEmergency, updateShortCircuitEmergency, clearPendingMode]);

  useEffect(() => {
    let active = true;
    let loggedHardwareSettingsFailure = false;

    const loadHardwareTestBattery = async () => {
      try {
        const { data: authData, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const token = authData.session?.access_token;
        if (!token) {
          testBatteryPercentageRef.current = null;
          return;
        }

        const response = await apiFetch(
          "/api/v1/public/hardware-test-settings",
          {
            headers: { Authorization: `Bearer ${token}` },
            cacheTtlMs: 0,
            timeoutMs: 8_000,
          },
        );
        if (!response.ok) {
          throw new Error(
            `Hardware test settings request failed with status ${response.status}.`,
          );
        }

        const body = (await response.json()) as {
          settings?: {
            enabled?: unknown;
            battery_percentage?: unknown;
          };
        };
        const settings = body.settings;
        if (
          !settings ||
          typeof settings.enabled !== "boolean" ||
          typeof settings.battery_percentage !== "number" ||
          !Number.isFinite(settings.battery_percentage) ||
          settings.battery_percentage < 0 ||
          settings.battery_percentage > 100
        ) {
          throw new Error("Hardware test settings response is invalid.");
        }
        if (active) {
          testBatteryPercentageRef.current = settings.enabled
            ? settings.battery_percentage
            : null;
          loggedHardwareSettingsFailure = false;
        }
      } catch (error) {
        if (!active) return;
        testBatteryPercentageRef.current = null;
        if (!loggedHardwareSettingsFailure) {
          console.error(
            "[power-override] failed to load hardware test battery",
            error,
          );
          loggedHardwareSettingsFailure = true;
        }
      }
    };

    void loadHardwareTestBattery();
    const interval = setInterval(() => {
      if (active) void loadHardwareTestBattery();
    }, 10_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

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
      console.warn("[power-override] rejected mode change during safety emergency");
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

    if (!o) {
      clearPendingMode();
      return;
    }

    // 1) Optimistic UI: screens show the new mode on this very frame.
    startPendingMode(o);

    const hubId = hubIdRef.current;
    if (!hubId) {
      // Hub id not resolved yet; flushed as soon as the connection is up.
      pendingOverrideRef.current = o;
      return;
    }

    // 2) Fast path: publish over the open MQTT socket (no HTTP round trip).
    let deliveredOverMqtt = false;
    const client = mqttClientRef.current;
    if (DIRECT_MQTT_FAST_PATH && client?.isConnected()) {
      try {
        const message = new Paho.Message(JSON.stringify(createPowerModeCommand(o)));
        message.destinationName = `${TELEMETRY_TOPIC_PREFIX}${hubId}/commands`;
        client.send(message);
        deliveredOverMqtt = true;
      } catch (error) {
        console.warn("[power-override] direct MQTT publish failed", error);
      }
    }

    // 3) HTTP path always runs immediately too (no longer waits for MQTT).
    pendingOverrideRef.current = o;
    void sendPowerModeCommand(hubId, o)
      .then(() => {
        if (pendingOverrideRef.current === o) pendingOverrideRef.current = null;
      })
      .catch((error) => {
        console.error("[power-override] failed to send mode to device", error);
        if (!deliveredOverMqtt) {
          // Nothing reached the hub: stop pretending the mode changed.
          clearPendingMode();
        }
      });
  }, [assertPowerControlsAvailable, clearPendingMode, startPendingMode]);

  const performOverride = useCallback(async (o: PowerOverride) => {
    if (o === "battery" && !ensureBatteryUsable()) return;
    if (o === "shutdown") {
      if (!allocationStopConfirmedRef.current) {
        setShutdownConfirmationPercentage(
          testBatteryPercentageRef.current ?? liveBatteryPercentageRef.current,
        );
        setShutdownConfirmationOpen(true);
        return;
      }
      await applyOverride(o);
      return;
    }
    if (o === "grid" && gridAvailable === false) {
      setGridUnavailableConfirmationOpen(true);
      return;
    }
    await applyOverride(o);
  }, [
    applyOverride,
    ensureBatteryUsable,
    gridAvailable,
  ]);

  const setOverride = useCallback(async (o: PowerOverride) => {
    try {
      assertPowerControlsAvailable();
    } catch {
      console.warn("[power-override] rejected mode change during safety emergency");
      return;
    }
    if (o === "grid" && gridAvailable === false) {
      setGridUnavailableConfirmationOpen(true);
      return;
    }
    if (o === "shutdown") {
      setShutdownConfirmationPercentage(
        testBatteryPercentageRef.current ?? liveBatteryPercentageRef.current,
      );
    }
    if (o === "grid" || o === "shutdown") {
      try {
        await runWithAllocationInterlock(
          o === "grid" ? "switching to Grid mode" : "shutting down",
          () => performOverride(o),
        );
      } catch (error) {
        console.error("[power-override] allocation interruption failed", error);
      }
      return;
    }
    await performOverride(o);
  }, [
    assertPowerControlsAvailable,
    gridAvailable,
    performOverride,
    runWithAllocationInterlock,
  ]);

  const cancelGridUnavailable = useCallback(() => {
    setGridUnavailableConfirmationOpen(false);
  }, []);

  const confirmShutdown = useCallback(() => {
    setShutdownConfirmationOpen(false);
    setShutdownConfirmationPercentage(null);
    void applyOverride("shutdown");
  }, [applyOverride]);

  const cancelShutdown = useCallback(() => {
    setShutdownConfirmationOpen(false);
    setShutdownConfirmationPercentage(null);
  }, []);

  const clearOverride = useCallback(() => setOverride(null), [setOverride]);

  const openOverrides = useCallback(() => setOverridesOpen(true), []);
  const closeOverrides = useCallback(() => setOverridesOpen(false), []);

  const value = useMemo<PowerOverrideContextValue>(
    () => ({
      override,
      pendingMode,
      setOverride,
      clearOverride,
      usingGrid: override === "grid" || override === null,
      overridesOpen,
      openOverrides,
      closeOverrides,
      smokeEmergencyActive,
      smokeEmergencyZone,
      shortCircuitActive,
      shortCircuitZone,
      gridUnavailableConfirmationOpen,
      cancelGridUnavailable,
      shutdownConfirmationOpen,
      shutdownConfirmationPercentage,
      confirmShutdown,
      cancelShutdown,
      assertPowerControlsAvailable,
      runWithAllocationInterlock,
      allocationStopConfirmationOpen,
      allocationStopActionLabel,
      allocationStopError,
      allocationStopInProgress,
      confirmAllocationForceStop,
      cancelAllocationForceStop,
      ensureBatteryUsable,
      batteryReservePercentage,
      dismissBatteryReserveWarning,
    }),
    [
      override,
      pendingMode,
      setOverride,
      clearOverride,
      overridesOpen,
      openOverrides,
      closeOverrides,
      smokeEmergencyActive,
      smokeEmergencyZone,
      shortCircuitActive,
      shortCircuitZone,
      gridUnavailableConfirmationOpen,
      cancelGridUnavailable,
      shutdownConfirmationOpen,
      shutdownConfirmationPercentage,
      confirmShutdown,
      cancelShutdown,
      assertPowerControlsAvailable,
      runWithAllocationInterlock,
      allocationStopConfirmationOpen,
      allocationStopActionLabel,
      allocationStopError,
      allocationStopInProgress,
      confirmAllocationForceStop,
      cancelAllocationForceStop,
      ensureBatteryUsable,
      batteryReservePercentage,
      dismissBatteryReserveWarning,
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