import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import {
  useLocalSearchParams,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { AppText as Text } from "../../components/app-text";
import { ScreenShell } from "../../components/screen-shell";
import { scale } from "../../components/glass-ui";
import { AllocationRecoveryModal } from "../../components/power-management-subtab/shared";
import { ZONES_STORAGE_KEY } from "../../components/zone-management-screen";
import {
  fetchHardwareTestSettings,
  getApplicationDate,
  type HardwareTestSettings,
} from "../../lib/hardware-test-settings";
import { supabase } from "../../lib/supabase";
import { fonts, useTheme } from "../../theme";
import {
  clearSystemAllocationRequiresNewPlan,
  SYSTEM_ALLOCATION_FORCE_STOPPED,
  systemAllocationRequiresNewPlan,
} from "../../lib/system-allocation-status";
import {
  isAllocationSummary,
  requestSystemAllocation,
} from "./allocation-api";
import {
  type AllocationPriority,
  type AllocationRoomInput,
  type AllocationSummary,
} from "./types";

type RoomSchedule = Omit<AllocationRoomInput, "watts"> & {
  watts: number | null;
};

type HubTelemetry = {
  sequence: number;
  gridWatts: number | null;
  batteryPct: number | null;
  powerMode: string | null;
  safetyAlarm: boolean;
  relayStates: Record<number, boolean>;
};

type AllocationCalculationContext = {
  adminTestMode: boolean;
  batteryPercentage: number;
  referenceTime: string;
  timeZone: string;
};

type JsonRecord = Record<string, unknown>;

class PowerModeRequiredError extends Error {}

const DEFAULT_HIGH_WEIGHT_PERCENT = 70;
const DEFAULT_INVERTER_EFFICIENCY = 1;
const TELEMETRY_TOPIC_PREFIX = "bawatpieza/devices";
const COMMAND_TOPIC_PREFIX = "bawatpieza/devices";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readPowerMode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isActivePowerMode(value: string | null): boolean {
  return value === "grid" || value === "battery";
}

function readPriority(value: unknown): AllocationPriority {
  if (value === "high") return "high";
  if (
    value === "low" ||
    value === undefined ||
    value === null
  ) {
    return "low";
  }
  throw new Error(`Unsupported room priority: ${String(value)}.`);
}

function readStartTime(value: unknown) {
  if (value === undefined || value === null) return "20:00";
  if (typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    return value;
  }
  throw new Error(`Invalid room start time: ${String(value)}.`);
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStartDate(value: unknown) {
  if (value === undefined || value === null) {
    return formatDateKey(new Date());
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid room start date: ${String(value)}.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (formatDateKey(date) !== value) {
    throw new Error(`Invalid room start date: ${value}.`);
  }
  return value;
}

function formatScheduleDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (formatDateKey(date) !== value) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatStartTimeForInput(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function parseStartTimeFromInput(value: string): string | null {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function averagePower(samples: HubTelemetry[]) {
  const values = samples
    .map((sample) => sample.gridWatts)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    throw new Error("The hub has not reported a valid PZEM power reading.");
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function formatScheduleTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDuration(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes === 0) return hours > 0 ? "Less than 1 minute" : "0 minutes";
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes} min`;
  if (minutes === 0) return `${wholeHours} hr`;
  return `${wholeHours} hr ${minutes} min`;
}

function SystemAllocationShell({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}) {
  if (embedded) return <>{children}</>;
  return (
    <ScreenShell scroll title="System Allocation" showBack>
      {children}
    </ScreenShell>
  );
}

export function SystemAllocationScreen({
  embedded = false,
  onStartAllocate,
  onViewAllocation,
  showRequiresNewPlanModal = !embedded,
  onRequiresNewPlanAcknowledged,
}: {
  embedded?: boolean;
  onStartAllocate?: () => void;
  onViewAllocation?: () => void;
  showRequiresNewPlanModal?: boolean;
  onRequiresNewPlanAcknowledged?: () => void;
}) {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { colors: c, mode } = useTheme();
  const { autoMeasure, returnTo } = useLocalSearchParams<{
    autoMeasure?: string;
    returnTo?: string;
  }>();
  const autoMeasureOnOpen = autoMeasure === "true";
  const returnToPowerAllocation = returnTo === "power-allocation";
  const [rooms, setRooms] = useState<RoomSchedule[]>([]);
  const [expandedRoomChannels, setExpandedRoomChannels] = useState<Set<number>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [hardwareTestSettings, setHardwareTestSettings] =
    useState<HardwareTestSettings | null>(null);
  const [hardwareTestSettingsLoaded, setHardwareTestSettingsLoaded] =
    useState(false);
  const [hardwareTestSettingsError, setHardwareTestSettingsError] =
    useState("");
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [calculationContext, setCalculationContext] =
    useState<AllocationCalculationContext | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [activeScanRoom, setActiveScanRoom] = useState("");
  const [scanReadings, setScanReadings] = useState<
    { channel: number; roomName: string; watts: number }[]
  >([]);
  const [startTimeDrafts, setStartTimeDrafts] = useState<
    Record<number, string>
  >({});
  const [datePickerTarget, setDatePickerTarget] = useState<
    number | "all" | null
  >(
    null,
  );
  const [allScheduleDate, setAllScheduleDate] = useState(() =>
    formatDateKey(new Date()),
  );
  const [allScheduleTimeDraft, setAllScheduleTimeDraft] =
    useState("08:00 PM");
  const [sharedScheduleDraftDirty, setSharedScheduleDraftDirty] =
    useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [powerModeModalVisible, setPowerModeModalVisible] = useState(false);
  const [powerModeModalMessage, setPowerModeModalMessage] = useState("");
  const [theoreticalEstimateModalVisible, setTheoreticalEstimateModalVisible] =
    useState(false);
  const [pastScheduleError, setPastScheduleError] = useState("");
  const [allocationSettingsModalVisible, setAllocationSettingsModalVisible] =
    useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [batteryInfoModalVisible, setBatteryInfoModalVisible] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [startingAllocation, setStartingAllocation] = useState(false);
  const [navigatingToAllocation, setNavigatingToAllocation] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<AllocationSummary | null>(null);
  const [requiresNewPlan, setRequiresNewPlan] = useState(false);
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [initialSocPercent, setInitialSocPercent] = useState<number | null>(
    null,
  );
  const allocationSocPercent =
    hardwareTestSettings?.enabled === true
      ? hardwareTestSettings.battery_percentage
      : initialSocPercent;
  const applicationDate = getApplicationDate(hardwareTestSettings, clockNowMs);
  const [highWeightPercent, setHighWeightPercent] = useState(
    String(DEFAULT_HIGH_WEIGHT_PERCENT),
  );
  const [inverterEfficiency, setInverterEfficiency] = useState(
    String(DEFAULT_INVERTER_EFFICIENCY),
  );
  const clientRef = useRef<Paho.Client | null>(null);
  const hubIdRef = useRef("");
  const showRequiresNewPlanModalRef = useRef(showRequiresNewPlanModal);
  const setupPayloadRef = useRef<JsonRecord | null>(null);
  const telemetryRef = useRef<HubTelemetry[]>([]);
  const telemetrySequenceRef = useRef(0);
  const telemetryWaitersRef = useRef(new Set<() => void>());
  const calculateImmediateStartAfterEstimateRef = useRef(false);
  const roomsRef = useRef<RoomSchedule[]>([]);
  const measureRoomWattsRef = useRef<(() => Promise<void>) | null>(null);
  const hardwareTestSettingsUpdatedAtRef = useRef("");

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    showRequiresNewPlanModalRef.current = showRequiresNewPlanModal;
  }, [showRequiresNewPlanModal]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      SYSTEM_ALLOCATION_FORCE_STOPPED,
      (stoppedHubId?: string) => {
        void (async () => {
          const hubId =
            hubIdRef.current || (await AsyncStorage.getItem("bawatpieza_hub_id"));
          if (!hubId || (stoppedHubId && stoppedHubId !== hubId)) return;
          setRequiresNewPlan(true);
          setRecoveryModalVisible(true);
          setSummary(null);
          setCalculationContext(null);
          setScheduleModalVisible(false);
          setStartingAllocation(false);
          setError("");
          setStatus(
            "Allocation stopped. Calculate a fresh runtime plan before starting again.",
          );
        })().catch((eventError: unknown) => {
          console.error(
            "[system-allocation] Could not reset the planner after force stop:",
            eventError,
          );
        });
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    const loadHardwareTestSettings = async () => {
      try {
        const settings = await fetchHardwareTestSettings();
        if (!active) return;
        if (
          hardwareTestSettingsUpdatedAtRef.current &&
          hardwareTestSettingsUpdatedAtRef.current !==
            settings.updated_at
        ) {
          setSummary(null);
          setCalculationContext(null);
          setScheduleModalVisible(false);
        }
        hardwareTestSettingsUpdatedAtRef.current = settings.updated_at;
        setHardwareTestSettings(settings);
        setHardwareTestSettingsError("");
        setHardwareTestSettingsLoaded(true);
        setClockNowMs(Date.now());
      } catch (settingsError) {
        console.error(
          "[system-allocation] Failed to load admin hardware test settings:",
          settingsError,
        );
        if (active) {
          setHardwareTestSettingsError(
            settingsError instanceof Error
              ? settingsError.message
              : "Could not verify admin hardware test settings.",
          );
          setHardwareTestSettingsLoaded(true);
        }
      }
    };

    void loadHardwareTestSettings();
    const settingsTimer = setInterval(
      () => void loadHardwareTestSettings(),
      10_000,
    );
    const clockTimer = setInterval(() => setClockNowMs(Date.now()), 10_000);
    return () => {
      active = false;
      clearInterval(settingsTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const waitForReadings = useCallback(
    (afterSequence: number, count: number) =>
      new Promise<HubTelemetry[]>((resolve, reject) => {
      let completed = false;
      const finish = (callback: () => void) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        telemetryWaitersRef.current.delete(check);
        callback();
      };
      const check = () => {
        const samples = telemetryRef.current
          .filter(
            (sample) =>
              sample.sequence > afterSequence && sample.gridWatts !== null,
          )
          .slice(0, count);
        if (samples.length >= count) {
          finish(() => resolve(samples));
        }
      };
      const timeout = setTimeout(() => {
        finish(() =>
          reject(
            new Error(
              "Timed out waiting for live hub power readings. Check the hub connection and retry.",
            ),
          ),
        );
      }, 15_000);
      telemetryWaitersRef.current.add(check);
      check();
      }),
    [],
  );

  const waitForRelayState = useCallback(
    (channel: number, expectedState: boolean, afterSequence: number) =>
      new Promise<void>((resolve, reject) => {
        let completed = false;
        const finish = (callback: () => void) => {
          if (completed) return;
          completed = true;
          clearTimeout(timeout);
          telemetryWaitersRef.current.delete(check);
          callback();
        };
        const check = () => {
          const confirmed = telemetryRef.current.some(
            (sample) =>
              sample.sequence > afterSequence &&
              sample.relayStates[channel] === expectedState,
          );
          if (confirmed) finish(resolve);
        };
        const timeout = setTimeout(
          () =>
            finish(() =>
              reject(
                new Error(
                  `Timed out waiting for channel ${channel} relay to turn ${expectedState ? "on" : "off"}.`,
                ),
              ),
            ),
          15_000,
        );
        telemetryWaitersRef.current.add(check);
        check();
      }),
    [],
  );

  const connectToHubTelemetry = async (hubId: string) => {
    if (clientRef.current?.isConnected()) return clientRef.current;

    const client = new Paho.Client(
      "broker.hivemq.com",
      8884,
      `app-room-watts-${Math.random().toString(16).slice(2, 10)}`,
    );
    const telemetryTopic = `${TELEMETRY_TOPIC_PREFIX}/${hubId}/telemetry`;
    client.onMessageArrived = (message) => {
      if (message.destinationName !== telemetryTopic) return;
      try {
        const payload: unknown = JSON.parse(message.payloadString);
        if (!isRecord(payload)) return;
        const relayStates: Record<number, boolean> = {};
        for (let channel = 1; channel <= 8; channel += 1) {
          const state = payload[`ch${channel}_on`];
          if (typeof state === "boolean") relayStates[channel] = state;
        }
        const reading: HubTelemetry = {
          sequence: ++telemetrySequenceRef.current,
          gridWatts: readNumber(payload.grid_w),
          batteryPct: readNumber(payload.bat_pct),
          powerMode: readPowerMode(payload.power_mode),
          safetyAlarm:
            payload.smoke_alert === true || payload.short_alert === true,
          relayStates,
        };
        telemetryRef.current = [...telemetryRef.current.slice(-30), reading];
        if (reading.batteryPct !== null) {
          setInitialSocPercent(reading.batteryPct);
        }
        telemetryWaitersRef.current.forEach((notify) => notify());
      } catch (telemetryError) {
        console.warn(
          "[system-allocation] Ignoring invalid hub telemetry:",
          telemetryError,
        );
      }
    };

    client.onConnectionLost = (response) => {
      clientRef.current = null;
      setMqttConnected(false);
      if (response.errorCode !== 0) {
        setError("Connection to the hub was lost. Reopen this screen to retry.");
      }
    };

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Could not connect to live hub telemetry."));
      }, 15_000);
      client.connect({
        useSSL: true,
        keepAliveInterval: 20,
        onSuccess: () => {
          try {
            client.subscribe(telemetryTopic);
            clearTimeout(timeout);
            clientRef.current = client;
            setMqttConnected(true);
            resolve();
          } catch (subscriptionError) {
            clearTimeout(timeout);
            reject(
              subscriptionError instanceof Error
                ? subscriptionError
                : new Error("Could not subscribe to hub power telemetry."),
            );
          }
        },
        onFailure: () => {
          clearTimeout(timeout);
          reject(new Error("Could not connect to live hub telemetry."));
        },
      });
    });
    return client;
  };

  const sendRelayCommand = useCallback(
    (
      client: Paho.Client,
      hubId: string,
      channel: number,
      state: boolean,
    ) => {
      if (!client.isConnected()) {
        throw new Error(
          "Hub command connection was lost during watt measurement.",
        );
      }
      const message = new Paho.Message(
        JSON.stringify({
          command: "room_relay",
          channel,
          state,
          ...(state ? { duration_minutes: 2 } : {}),
        }),
      );
      message.destinationName = `${COMMAND_TOPIC_PREFIX}/${hubId}/commands`;
      client.send(message);
    },
    [],
  );

  const saveConfiguration = useCallback(async (
    updatedRooms: RoomSchedule[],
    settings?: { highWeight: number; efficiency: number },
  ): Promise<string | null> => {
    const hubId = hubIdRef.current;
    const oldPayload = setupPayloadRef.current;
    if (!hubId || !oldPayload || !Array.isArray(oldPayload.channels)) {
      throw new Error("The saved device room configuration is unavailable.");
    }

    const channels = oldPayload.channels.map((entry) => {
      if (!isRecord(entry)) return entry;
      const channelNumber = readNumber(entry.channel);
      const room = updatedRooms.find(
        (configuredRoom) => configuredRoom.channel === channelNumber,
      );
      if (!room) return entry;
      return {
        ...entry,
        watts: room.watts,
        priority_status: room.priority,
        allocation_priority: room.priority,
        start_date: room.startDate,
        start_time: room.startTime,
      };
    });
    const updatedPayload: JsonRecord = {
      ...oldPayload,
      channels,
      ...(settings
        ? {
            allocation_settings: {
              ...(isRecord(oldPayload.allocation_settings)
                ? oldPayload.allocation_settings
                : {}),
              high_priority_weight: settings.highWeight,
              low_priority_weight: 1 - settings.highWeight,
              inverter_efficiency: settings.efficiency,
            },
          }
        : {}),
    };
    const { data: savedSetup, error: saveError } = await supabase
      .from("device_setups")
      .update({
        setup_payload: updatedPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("hub_id", hubId)
      .select("setup_payload")
      .maybeSingle();
    if (saveError) {
      throw new Error(`Could not save room allocation settings: ${saveError.message}`);
    }
    if (
      !savedSetup ||
      !isRecord(savedSetup.setup_payload) ||
      !Array.isArray(savedSetup.setup_payload.channels)
    ) {
      throw new Error(
        "Room allocation settings were not saved. Reload System Allocation and try again.",
      );
    }
    const savedChannels = savedSetup.setup_payload.channels;
    const savedSettingsMatch = updatedRooms.every((room) =>
      savedChannels.some(
        (entry) =>
          isRecord(entry) &&
          readNumber(entry.channel) === room.channel &&
          readNumber(entry.watts) === room.watts &&
          (entry.allocation_priority ?? entry.priority_status) ===
            room.priority &&
          entry.start_date === room.startDate &&
          entry.start_time === room.startTime,
      ),
    );
    if (!savedSettingsMatch) {
      throw new Error(
        "The saved room schedules or priorities do not match your selections. Review System Allocation and save again before starting.",
      );
    }
    setupPayloadRef.current = savedSetup.setup_payload;

    try {
      const localZonesValue = await AsyncStorage.getItem(ZONES_STORAGE_KEY);
      if (localZonesValue) {
        const parsedZones: unknown = JSON.parse(localZonesValue);
        if (!Array.isArray(parsedZones)) {
          throw new Error("The locally cached room list is invalid.");
        }
        const updatedZones = parsedZones.map((zone) => {
          if (!isRecord(zone)) return zone;
          const channelNumber = readNumber(zone.channel);
          const room = updatedRooms.find(
            (configuredRoom) => configuredRoom.channel === channelNumber,
          );
          return room ? { ...zone, watts: room.watts } : zone;
        });
        await AsyncStorage.setItem(
          ZONES_STORAGE_KEY,
          JSON.stringify(updatedZones),
        );
      }
    } catch (cacheError) {
      console.error(
        "[system-allocation] Device setup was saved, but the local zone cache could not update:",
        cacheError,
      );
      return "Settings were saved to the device setup, but the local dashboard watt cache could not update.";
    }
    return null;
  }, []);

  const measureRoomWatts = useCallback(async () => {
    const client = clientRef.current;
    const hubId = hubIdRef.current;
    const configuredRooms = roomsRef.current;
    if (!client?.isConnected() || !hubId) {
      throw new Error("The paired hub is not connected for watt measurement.");
    }
    if (configuredRooms.length === 0) {
      throw new Error("No configured relay rooms were found.");
    }

    setMeasuring(true);
    setError("");
    setStatus("");
    setScanProgress(0);
    setActiveScanRoom("");
    setScanReadings([]);
    setSummary(null);
    const measurements = new Map<number, number>();
    let relayCommandStarted = false;
    let relayShutoffFailed = false;
    try {
      let latest = telemetryRef.current[telemetryRef.current.length - 1];
      if (!latest) {
        throw new PowerModeRequiredError(
          "The hub has not reported its power mode. Turn on Grid or Battery power and wait for live telemetry before scanning.",
        );
      }
      if (!isActivePowerMode(latest.powerMode)) {
        throw new PowerModeRequiredError(
          `The hub currently reports "${latest.powerMode ?? "unknown"}". Turn on Grid or Battery power before scanning room wattage.`,
        );
      }
      if (latest.safetyAlarm) {
        throw new Error(
          "Room watt measurement is disabled while a smoke or short-circuit alarm is active.",
        );
      }
      for (const room of configuredRooms) {
        if (latest.relayStates[room.channel] === undefined) {
          throw new Error(
            `The installed firmware does not report relay state for channel ${room.channel}. Update the hub firmware before measuring this room.`,
          );
        }
        if (latest.relayStates[room.channel]) {
          throw new Error(
            `Turn off all configured room bulbs before starting the automatic watt scan. Channel ${room.channel} is currently on.`,
          );
        }
      }

      setStatus("Confirming all room relays are off...");
      setScanProgress(10);
      relayCommandStarted = true;
      const allOffSequence = telemetrySequenceRef.current;
      for (const room of configuredRooms) {
        sendRelayCommand(client, hubId, room.channel, false);
      }
      await Promise.all(
        configuredRooms.map((room) =>
          waitForRelayState(room.channel, false, allOffSequence),
        ),
      );
      await wait(1000);
      setStatus("Measuring all-off power baseline...");
      const baselineSequence = telemetrySequenceRef.current;
      const baseline = averagePower(
        await waitForReadings(baselineSequence, 3),
      );
      setScanProgress(25);

      for (let index = 0; index < configuredRooms.length; index += 1) {
        const room = configuredRooms[index];
        setActiveScanRoom(room.roomName);
        setStatus(
          `Turning on ${room.roomName} (${index + 1} of ${configuredRooms.length}) and waiting for relay confirmation...`,
        );
        const relayOnSequence = telemetrySequenceRef.current;
        sendRelayCommand(client, hubId, room.channel, true);
        await waitForRelayState(room.channel, true, relayOnSequence);
        await wait(1000);
        setStatus(`Sampling PZEM power for ${room.roomName}...`);
        const roomSequence = telemetrySequenceRef.current;
        const roomPower = averagePower(
          await waitForReadings(roomSequence, 3),
        );
        setStatus(`Turning off ${room.roomName}...`);
        const relayOffSequence = telemetrySequenceRef.current;
        sendRelayCommand(client, hubId, room.channel, false);
        await waitForRelayState(room.channel, false, relayOffSequence);
        const watts = Number(Math.max(0, roomPower - baseline).toFixed(2));
        if (!Number.isFinite(watts) || watts <= 0) {
          throw new Error(
            `${room.roomName} measured 0W (all-off ${baseline.toFixed(1)}W; bulb-on ${roomPower.toFixed(1)}W). The relay was confirmed on but PZEM power did not increase. Check the bulb and meter wiring, then retry.`,
          );
        }
        measurements.set(room.channel, watts);
        setScanReadings((current) => [
          ...current,
          { channel: room.channel, roomName: room.roomName, watts },
        ]);
        setScanProgress(
          Math.round(25 + ((index + 1) / configuredRooms.length) * 65),
        );
        await wait(1000);
      }

      const measuredRooms = configuredRooms.map((room) => {
        const watts = measurements.get(room.channel);
        if (watts === undefined) {
          throw new Error(`No watt measurement was received for ${room.roomName}.`);
        }
        return { ...room, watts };
      });
      setStatus("Saving measured wattage...");
      setScanProgress(95);
      const cacheWarning = await saveConfiguration(measuredRooms);
      setScanProgress(100);
      setRooms(measuredRooms);
      setStatus(
        `Measured and saved ${measuredRooms.length} room bulb${measuredRooms.length === 1 ? "" : "s"}.`,
      );
      if (cacheWarning) setError(cacheWarning);
    } finally {
      if (relayCommandStarted) {
        try {
          const allOffSequence = telemetrySequenceRef.current;
          for (const room of configuredRooms) {
            sendRelayCommand(client, hubId, room.channel, false);
          }
          await Promise.all(
            configuredRooms.map((room) =>
              waitForRelayState(room.channel, false, allOffSequence),
            ),
          );
        } catch (restoreError) {
          console.error(
            "[system-allocation] Could not switch room relays off after measurement:",
            restoreError,
          );
          relayShutoffFailed = true;
        }
      }
      setMeasuring(false);
      if (relayShutoffFailed) {
        throw new Error(
          "The hub could not confirm all room bulbs are off after measurement. Check the lights manually.",
        );
      }
    }
  }, [
    saveConfiguration,
    sendRelayCommand,
    waitForReadings,
    waitForRelayState,
  ]);

  const requestWattScan = useCallback(async () => {
    setError("");
    setStatus("");
    const latest = telemetryRef.current[telemetryRef.current.length - 1];
    if (!latest || !isActivePowerMode(latest.powerMode)) {
      setPowerModeModalMessage(
        latest
          ? `The hub currently reports "${latest.powerMode ?? "unknown"}". Turn on Grid or Battery power and wait for the hub to report the new mode, then try the scan again.`
          : "The hub has not reported its current power mode. Turn on Grid or Battery power and wait for live telemetry before scanning.",
      );
      setPowerModeModalVisible(true);
      return;
    }

    try {
      setScanModalVisible(true);
      await measureRoomWatts();
    } catch (measureError) {
      console.error("[system-allocation] Room watt scan failed:", measureError);
      setScanProgress(0);
      setStatus("");
      if (measureError instanceof PowerModeRequiredError) {
        setScanModalVisible(false);
        setPowerModeModalMessage(measureError.message);
        setPowerModeModalVisible(true);
      } else {
        setError(
          measureError instanceof Error
            ? measureError.message
            : "Could not measure room bulb wattage.",
        );
      }
    }
  }, [measureRoomWatts]);

  useEffect(() => {
    measureRoomWattsRef.current = requestWattScan;
  }, [requestWattScan]);

  useEffect(() => {
    let cancelled = false;

    const loadSystem = async () => {
      setLoading(true);
      setError("");
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) throw new Error("No paired hub was found on this device.");
        hubIdRef.current = hubId;
        const mustCalculateNewPlan =
          await systemAllocationRequiresNewPlan(hubId);
        if (!cancelled) {
          setRequiresNewPlan(mustCalculateNewPlan);
          setRecoveryModalVisible(
            mustCalculateNewPlan &&
              showRequiresNewPlanModalRef.current,
          );
        }

        const { data, error: setupError } = await supabase
          .from("device_setups")
          .select("setup_payload")
          .eq("hub_id", hubId)
          .maybeSingle();
        if (setupError) {
          throw new Error(`Could not load device room setup: ${setupError.message}`);
        }
        const payload = data?.setup_payload;
        if (!isRecord(payload) || !Array.isArray(payload.channels)) {
          throw new Error("The paired hub has no valid configured room channels.");
        }

        const configuredChannels = new Set<number>();
        const configuredRooms = payload.channels.map((entry, index) => {
          if (!isRecord(entry)) {
            throw new Error(`Configured room ${index + 1} is invalid.`);
          }
          const channel = readNumber(entry.channel);
          if (channel === null || !Number.isInteger(channel)) {
            throw new Error(`Configured room ${index + 1} has no relay channel.`);
          }
          if (configuredChannels.has(channel)) {
            throw new Error(`Relay channel ${channel} is configured more than once.`);
          }
          configuredChannels.add(channel);
          const rawRooms = entry.rooms;
          const firstRoom =
            Array.isArray(rawRooms) && rawRooms.length > 0
              ? rawRooms[0]
              : null;
          if (!isRecord(firstRoom) || typeof firstRoom.name !== "string") {
            throw new Error(`Relay channel ${channel} has no configured room name.`);
          }
          if (!firstRoom.name.trim()) {
            throw new Error(`Relay channel ${channel} needs a room name.`);
          }
          if (firstRoom.bulbs !== undefined && firstRoom.bulbs !== 1) {
            throw new Error(
              `${firstRoom.name} has ${String(firstRoom.bulbs)} bulbs; this planner requires exactly one bulb per room.`,
            );
          }
          return {
            channel,
            roomName: firstRoom.name.trim(),
            watts: readNumber(entry.watts),
            priority: readPriority(
              entry.allocation_priority ?? entry.priority_status,
            ),
            startDate: readStartDate(entry.start_date),
            startTime: readStartTime(entry.start_time),
          } satisfies RoomSchedule;
        });
        if (configuredRooms.length === 0) {
          throw new Error("No configured room channels were found.");
        }

        const rawSettings = payload.allocation_settings;
        const savedHighWeight = isRecord(rawSettings)
          ? readNumber(rawSettings.high_priority_weight)
          : null;
        const savedEfficiency = isRecord(rawSettings)
          ? readNumber(rawSettings.inverter_efficiency)
          : null;
        if (!cancelled) {
          const initialTimeDrafts: Record<number, string> = {};
          configuredRooms.forEach((room) => {
            initialTimeDrafts[room.channel] = formatStartTimeForInput(
              room.startTime,
            );
          });
          setupPayloadRef.current = payload;
          roomsRef.current = configuredRooms;
          setRooms(configuredRooms);
          setStartTimeDrafts(initialTimeDrafts);
          setAllScheduleDate(configuredRooms[0].startDate);
          setAllScheduleTimeDraft(
            formatStartTimeForInput(configuredRooms[0].startTime),
          );
          setSharedScheduleDraftDirty(false);
          if (savedHighWeight !== null && savedHighWeight >= 0 && savedHighWeight <= 1) {
            setHighWeightPercent(String(savedHighWeight * 100));
          }
          if (
            savedEfficiency !== null &&
            savedEfficiency > 0 &&
            savedEfficiency <= 1
          ) {
            setInverterEfficiency(String(savedEfficiency));
          }
        }

        const telemetrySequence = telemetrySequenceRef.current;
        await connectToHubTelemetry(hubId);

        if (
          autoMeasureOnOpen &&
          configuredRooms.some((room) => room.watts === null || room.watts <= 0)
        ) {
          void waitForReadings(telemetrySequence, 1)
            .then(async () => {
              if (cancelled) return;
              const runMeasurement = measureRoomWattsRef.current;
              if (!runMeasurement) {
                throw new Error(
                  "The room watt measurement service is unavailable.",
                );
              }
              await runMeasurement();
            })
            .catch((scanError: unknown) => {
              if (cancelled) return;
              console.error(
                "[system-allocation] Initial room watt scan failed:",
                scanError,
              );
              setError(
                scanError instanceof Error
                  ? scanError.message
                  : "Could not receive live power readings for the room watt scan.",
              );
            });
        }
      } catch (loadError) {
        console.error("[system-allocation] Setup load failed:", loadError);
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load the system allocation planner.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSystem();
    return () => {
      cancelled = true;
      const client = clientRef.current;
      clientRef.current = null;
      if (client?.isConnected()) client.disconnect();
    };
  }, [autoMeasureOnOpen, waitForReadings]);

  const updateRoom = (
    channel: number,
    updates: Partial<
      Pick<RoomSchedule, "priority" | "startDate" | "startTime">
    >,
  ) => {
    setSummary(null);
    setRooms((current) =>
      current.map((room) =>
        room.channel === channel ? { ...room, ...updates } : room,
      ),
    );
  };

    const applyScheduleToAllRooms = () => {
      const startTime = parseStartTimeFromInput(allScheduleTimeDraft);
      if (!startTime) {
        setError("Enter a valid shared start time, such as 08:00 PM.");
        return;
      }
      if (allScheduleDate < formatDateKey(applicationDate)) {
        setError("Choose today or a future date for the shared room schedule.");
        return;
      }
      if (rooms.length === 0) {
        setError("No configured rooms are available to update.");
        return;
      }

      const normalizedStartTime = formatStartTimeForInput(startTime);
      setRooms((current) =>
        current.map((room) => ({
          ...room,
          startDate: allScheduleDate,
          startTime,
        })),
      );
      setStartTimeDrafts((current) => ({
        ...current,
        ...Object.fromEntries(
          rooms.map((room) => [room.channel, normalizedStartTime]),
        ),
      }));
      setSharedScheduleDraftDirty(false);
      setSummary(null);
      setError("");
      setStatus("The shared date and time were applied to all rooms.");
    };

  const calculatePlan = async (
    confirmTheoreticalEstimate = false,
    startAsSoonAsPossible = false,
  ) => {
    setError("");
    setStatus("");
    try {
      if (!hardwareTestSettingsLoaded || hardwareTestSettingsError) {
        throw new Error(
          hardwareTestSettingsError ||
            "Waiting to verify admin hardware test settings.",
        );
      }
      if (allocationSocPercent === null) {
        throw new Error("Waiting for a live battery state-of-charge reading.");
      }
      if (rooms.some((room) => room.watts === null || room.watts <= 0)) {
        throw new Error("Measure a positive wattage for every configured room first.");
      }
      if (!highWeightPercent.trim() || !inverterEfficiency.trim()) {
        throw new Error("Enter both a HIGH priority share and inverter efficiency.");
      }
      if (allocationSocPercent <= 20 && !confirmTheoreticalEstimate) {
        calculateImmediateStartAfterEstimateRef.current =
          startAsSoonAsPossible;
        setTheoreticalEstimateModalVisible(true);
        return;
      }
      calculateImmediateStartAfterEstimateRef.current = false;
      const highWeight = Number(highWeightPercent) / 100;
      const efficiency = Number(inverterEfficiency);
      const adminTestMode = hardwareTestSettings?.enabled === true;
      const referenceDate = getApplicationDate(hardwareTestSettings, Date.now());
      const immediateStartDate = startAsSoonAsPossible
        ? new Date(referenceDate.getTime() + 2 * 60 * 1000)
        : null;
      const immediateStartTime = immediateStartDate
        ? `${String(immediateStartDate.getHours()).padStart(2, "0")}:${String(immediateStartDate.getMinutes()).padStart(2, "0")}`
        : null;
      const applySharedSchedule =
        sharedScheduleDraftDirty && !immediateStartDate;
      const sharedStartTime = applySharedSchedule
        ? parseStartTimeFromInput(allScheduleTimeDraft)
        : null;
      if (applySharedSchedule && !sharedStartTime) {
        throw new Error(
          "Enter a valid shared start time, such as 08:00 PM.",
        );
      }
      if (applySharedSchedule && rooms.length === 0) {
        throw new Error("No configured rooms are available to update.");
      }
      if (
        applySharedSchedule &&
        allScheduleDate < formatDateKey(referenceDate)
      ) {
        throw new Error("Choose today or a future date for the shared room schedule.");
      }
      if (immediateStartDate && immediateStartTime) {
        const immediateStartDateKey = formatDateKey(immediateStartDate);
        const immediateStartTimeDraft =
          formatStartTimeForInput(immediateStartTime);
        setRooms((current) =>
          current.map((room) => ({
            ...room,
            startDate: immediateStartDateKey,
            startTime: immediateStartTime,
          })),
        );
        setStartTimeDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            rooms.map((room) => [room.channel, immediateStartTimeDraft]),
          ),
        }));
        setAllScheduleDate(immediateStartDateKey);
        setAllScheduleTimeDraft(immediateStartTimeDraft);
        setSharedScheduleDraftDirty(false);
      } else if (applySharedSchedule && sharedStartTime) {
        const sharedStartTimeDraft =
          formatStartTimeForInput(sharedStartTime);
        setRooms((current) =>
          current.map((room) => ({
            ...room,
            startDate: allScheduleDate,
            startTime: sharedStartTime,
          })),
        );
        setStartTimeDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            rooms.map((room) => [room.channel, sharedStartTimeDraft]),
          ),
        }));
        setSharedScheduleDraftDirty(false);
        setStatus("The shared schedule was applied to all rooms.");
      }
      const timeZone = getLocalTimeZone();
      const allocationInputs = rooms.map((room) => {
        if (room.watts === null || room.watts <= 0) {
          throw new Error(`Measure a positive wattage for ${room.roomName} first.`);
        }
        const timeDraft = immediateStartTime
          ? formatStartTimeForInput(immediateStartTime)
          : applySharedSchedule && sharedStartTime
            ? formatStartTimeForInput(sharedStartTime)
            : (startTimeDrafts[room.channel] ??
              formatStartTimeForInput(room.startTime));
        const startTime = immediateStartTime ??
          (applySharedSchedule
            ? sharedStartTime
            : parseStartTimeFromInput(timeDraft));
        if (!startTime) {
          throw new Error(
            `Enter a valid start time for ${room.roomName}, such as 08:00 PM.`,
          );
        }
        return {
          ...room,
          startDate: immediateStartDate
            ? formatDateKey(immediateStartDate)
            : applySharedSchedule
              ? allScheduleDate
              : readStartDate(room.startDate),
          startTime,
          watts: room.watts,
        };
      });
      setSavingPlan(true);
      const hubId = hubIdRef.current;
      if (!hubId) throw new Error("The paired hub is unavailable.");
      const cacheWarning = await saveConfiguration(allocationInputs, {
        highWeight,
        efficiency,
      });
      const calculated = await requestSystemAllocation({
        hubId,
        rooms: allocationInputs,
        initialSocPercent: allocationSocPercent,
        highPriorityWeight: highWeight,
        inverterEfficiency: efficiency,
        now: referenceDate.toISOString(),
        timeZone,
      });
      const currentPayload = setupPayloadRef.current;
      if (!currentPayload) {
        throw new Error(
          "The saved device room configuration is unavailable after calculation.",
        );
      }
      const currentSettings = isRecord(currentPayload.allocation_settings)
        ? currentPayload.allocation_settings
        : {};
      const calculatedAt = new Date().toISOString();
      const payloadWithCalculation: JsonRecord = {
        ...currentPayload,
        allocation_settings: {
          ...currentSettings,
          last_calculation: {
            calculated_at: calculatedAt,
            summary: calculated,
          },
        },
      };
      const { data: savedPlan, error: savePlanError } = await supabase
        .from("device_setups")
        .update({
          setup_payload: payloadWithCalculation,
          updated_at: calculatedAt,
        })
        .eq("hub_id", hubId)
        .select("setup_payload")
        .maybeSingle();
      if (savePlanError) {
        throw new Error(
          `Runtime plan was calculated but could not be saved: ${savePlanError.message}`,
        );
      }
      if (!savedPlan || !isRecord(savedPlan.setup_payload)) {
        throw new Error(
          "Runtime plan was calculated but was not saved to the device setup.",
        );
      }
      const persistedSettings = savedPlan.setup_payload.allocation_settings;
      const persistedCalculation =
        isRecord(persistedSettings) && isRecord(persistedSettings.last_calculation)
          ? persistedSettings.last_calculation
          : null;
      if (
        !persistedCalculation ||
        persistedCalculation.calculated_at !== calculatedAt ||
        !isAllocationSummary(persistedCalculation.summary)
      ) {
        throw new Error(
          "Runtime plan was calculated but the saved device setup did not return the new plan.",
        );
      }
      setupPayloadRef.current = savedPlan.setup_payload;
      await clearSystemAllocationRequiresNewPlan(hubId);
      setRequiresNewPlan(false);
      setRecoveryModalVisible(false);
      setSummary(persistedCalculation.summary);
      setCalculationContext({
        adminTestMode,
        batteryPercentage: allocationSocPercent,
        referenceTime: referenceDate.toISOString(),
        timeZone,
      });
      setScheduleModalVisible(true);
      setStatus("Runtime plan calculated and saved.");
      if (cacheWarning) setError(cacheWarning);
    } catch (planError) {
      const errorMessage =
        planError instanceof Error
          ? planError.message
          : "Could not calculate the room runtime plan.";
      if (/Scheduled start .+ must be in the future\./i.test(errorMessage)) {
        setPastScheduleError(errorMessage);
      } else {
        console.error("[system-allocation] Plan calculation failed:", planError);
        setError(errorMessage);
      }
    } finally {
      setSavingPlan(false);
    }
  };

  const panel = {
    backgroundColor: c.surface,
    borderColor: c.line,
    shadowColor: c.text,
    shadowOpacity: mode === "dark" ? 0 : 0.06,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: scale(4) },
    elevation: mode === "dark" ? 0 : 2,
  };
  const efficiencyValue = Number(inverterEfficiency);
  const hasValidEfficiency =
    Number.isFinite(efficiencyValue) &&
    efficiencyValue > 0 &&
    efficiencyValue <= 1;
  const batteryTotalWh = 12.8 * 60;
  const batteryUsableWh = hasValidEfficiency
    ? batteryTotalWh * 0.8 * efficiencyValue
    : null;
  const batteryAvailableNowWh =
    allocationSocPercent === null || !hasValidEfficiency
      ? null
      : Math.min(
          batteryUsableWh ?? 0,
          batteryTotalWh *
            Math.max(0, allocationSocPercent / 100 - 0.2) *
            efficiencyValue,
        );
  const hasMeasuredRoomWatts =
    rooms.length > 0 &&
    rooms.every((room) => room.watts !== null && room.watts > 0);
  const canStartAllocation = Boolean(
    onStartAllocate || returnToPowerAllocation,
  );
  const canNavigateToAllocation = Boolean(
    onViewAllocation || returnToPowerAllocation,
  );
  const datePickerRoom =
    datePickerTarget === null || datePickerTarget === "all"
      ? null
      : rooms.find((room) => room.channel === datePickerTarget) ?? null;
  const datePickerSelectedDate =
    datePickerTarget === "all"
      ? allScheduleDate
      : datePickerRoom?.startDate ?? null;
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarFirstDay = new Date(
    calendarYear,
    calendarMonthIndex,
    1,
  ).getDay();
  const calendarDaysInMonth = new Date(
    calendarYear,
    calendarMonthIndex + 1,
    0,
  ).getDate();
  const calendarCellCount =
    Math.ceil((calendarFirstDay + calendarDaysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: calendarCellCount }, (_, index) => {
    const day = index - calendarFirstDay + 1;
    return day >= 1 && day <= calendarDaysInMonth ? day : null;
  });
  const calendarWeeks = Array.from(
    { length: calendarCellCount / 7 },
    (_, index) => calendarDays.slice(index * 7, index * 7 + 7),
  );
  const todayDateKey = formatDateKey(applicationDate);
  const sharedScheduleNeedsApply = sharedScheduleDraftDirty;
  const navigateToAllocation = async () => {
    if (navigatingToAllocation) return;
    setNavigatingToAllocation(true);
    setError("");
    try {
      if (rooms.length > 0 && setupPayloadRef.current) {
        const applySharedSchedule = sharedScheduleDraftDirty;
        const sharedStartTime = applySharedSchedule
          ? parseStartTimeFromInput(allScheduleTimeDraft)
          : null;
        if (applySharedSchedule && !sharedStartTime) {
          throw new Error(
            "Enter a valid shared start time, such as 08:00 PM.",
          );
        }
        if (
          applySharedSchedule &&
          allScheduleDate < formatDateKey(applicationDate)
        ) {
          throw new Error("Choose today or a future date for the shared room schedule.");
        }
        const roomsToSave = rooms.map((room) => {
          const timeDraft = applySharedSchedule && sharedStartTime
            ? formatStartTimeForInput(sharedStartTime)
            : (startTimeDrafts[room.channel] ??
              formatStartTimeForInput(room.startTime));
          const startTime = applySharedSchedule
            ? sharedStartTime
            : parseStartTimeFromInput(timeDraft);
          if (!startTime) {
            throw new Error(
              `Enter a valid start time for ${room.roomName}, such as 08:00 PM.`,
            );
          }
          return {
            ...room,
            startDate: applySharedSchedule
              ? readStartDate(allScheduleDate)
              : readStartDate(room.startDate),
            startTime,
          };
        });
        const cacheWarning = await saveConfiguration(roomsToSave);
        setRooms(roomsToSave);
        setStartTimeDrafts(
          Object.fromEntries(
            roomsToSave.map((room) => [
              room.channel,
              formatStartTimeForInput(room.startTime),
            ]),
          ),
        );
        setSharedScheduleDraftDirty(false);
        setSummary(null);
        if (cacheWarning) setError(cacheWarning);
      }
      if (onViewAllocation) {
        onViewAllocation();
      } else if (returnToPowerAllocation && rootNavigationState?.key) {
        router.back();
      }
    } catch (navigationError) {
      console.error(
        "[system-allocation] Could not save room schedule before navigation:",
        navigationError,
      );
      setError(
        navigationError instanceof Error
          ? navigationError.message
          : "Could not save room schedules before opening Allocation.",
      );
    } finally {
      setNavigatingToAllocation(false);
    }
  };
  const startAllocation = async () => {
    if (!canStartAllocation || !hasMeasuredRoomWatts || startingAllocation) {
      return;
    }
    if (!summary) {
      setError("Calculate a fresh runtime plan before starting the allocation.");
      return;
    }

    const highWeight = Number(highWeightPercent) / 100;
    const efficiency = Number(inverterEfficiency);
    if (
      !Number.isFinite(highWeight) ||
      highWeight < 0 ||
      highWeight > 1 ||
      !Number.isFinite(efficiency) ||
      efficiency <= 0 ||
      efficiency > 1
    ) {
      setError("Enter valid allocation weights and inverter efficiency first.");
      return;
    }

    setStartingAllocation(true);
    setError("");
    try {
      const allocationRooms = rooms.map((room) => {
        const timeDraft =
          startTimeDrafts[room.channel] ??
          formatStartTimeForInput(room.startTime);
        const startTime = parseStartTimeFromInput(timeDraft);
        if (!startTime) {
          throw new Error(
            `Enter a valid start time for ${room.roomName}, such as 08:00 PM.`,
          );
        }
        return {
          ...room,
          startDate: readStartDate(room.startDate),
          startTime,
        };
      });
      const cacheWarning = await saveConfiguration(allocationRooms, {
        highWeight,
        efficiency,
      });
      if (cacheWarning) setError(cacheWarning);
      setScheduleModalVisible(false);
      if (onStartAllocate) {
        onStartAllocate();
      } else if (returnToPowerAllocation && rootNavigationState?.key) {
        router.back();
      }
    } catch (allocationError) {
      console.error(
        "[system-allocation] Could not start allocation:",
        allocationError,
      );
      setError(
        allocationError instanceof Error
          ? allocationError.message
          : "Could not save the room setup before starting allocation.",
      );
    } finally {
      setStartingAllocation(false);
    }
  };

  return (
    <SystemAllocationShell embedded={embedded}>
      <View style={styles.content}>
        <AllocationRecoveryModal
          visible={recoveryModalVisible}
          reason="stopped"
          c={c}
          onContinue={() => {
            setRecoveryModalVisible(false);
            onRequiresNewPlanAcknowledged?.();
          }}
        />
        <Text style={[styles.heading, styles.pageHeading, { color: c.text }]}>
          Battery Runtime Planner
        </Text>
        <Text style={[styles.copy, { color: c.muted }]}>
          Scan each room&apos;s bulb wattage to generate a battery runtime plan
          with estimated run times and shutoff times.
        </Text>
        {requiresNewPlan ? (
          <Text style={[styles.copy, { color: c.orange, fontFamily: fonts.semibold }]}>
            The previous allocation was stopped. Calculate a new plan before
            starting the system allocation again.
          </Text>
        ) : null}
        {canNavigateToAllocation ? (
          <Pressable
            onPress={() => void navigateToAllocation()}
            style={({ pressed }) => [
              styles.card,
              panel,
              {
                backgroundColor: pressed ? c.surfaceMuted : c.surface,
                flexDirection: "row",
                alignItems: "center",
                gap: scale(12),
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ busy: navigatingToAllocation }}
            accessibilityLabel="Open the Allocation tab without starting an allocation"
          >
            <View style={[styles.roomIcon, { backgroundColor: c.accentSoft }]}>
              {navigatingToAllocation ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <Ionicons name="flash-outline" size={19} color={c.text} />
              )}
            </View>
            <View style={styles.roomTitleGroup}>
              <Text style={[styles.cardTitle, { color: c.text }]}>
                Start Allocation
              </Text>
              <Text style={[styles.copy, { color: c.muted }]}>
                Save the room schedule and open Allocation without starting
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        ) : null}
        {!hardwareTestSettingsLoaded ? (
          <View style={styles.loading}>
            <ActivityIndicator color={c.accent} />
            <Text style={[styles.copy, { color: c.muted }]}>
              Preparing runtime planner...
            </Text>
          </View>
        ) : hardwareTestSettingsError ? (
          <View style={[styles.card, panel]}>
            <Text style={[styles.cardTitle, { color: c.danger }]}>
              Planner settings unavailable
            </Text>
            <Text style={[styles.copy, { color: c.muted }]}>
              {hardwareTestSettingsError} Runtime calculation is disabled until
              planner settings can be verified.
            </Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: c.muted }]}>
          CONFIGURE ALLOCATION
        </Text>
        <Pressable
          onPress={() => setAllocationSettingsModalVisible(true)}
          style={({ pressed }) => [
            styles.card,
            panel,
            {
              backgroundColor: pressed ? c.surfaceMuted : c.surface,
              flexDirection: "row",
              alignItems: "center",
              gap: scale(12),
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open allocation settings"
        >
          <View style={[styles.roomIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="options-outline" size={19} color={c.text} />
          </View>
          <View style={styles.roomTitleGroup}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Allocation settings
            </Text>
            <Text style={[styles.copy, { color: c.muted }]}>
              Efficiency {inverterEfficiency || "—"} · HIGH share{" "}
              {highWeightPercent || "—"}%
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>

        <View style={[styles.card, panel]}>
          <View style={styles.roomHeader}>
            <View style={[styles.roomIcon, { backgroundColor: c.accentSoft }]}>
              <Ionicons name="calendar-outline" size={19} color={c.text} />
            </View>
            <View style={styles.roomTitleGroup}>
              <Text style={[styles.cardTitle, { color: c.text }]}>
                Set date and time for all rooms
              </Text>
              <Text style={[styles.copy, { color: c.muted }]}>
                Apply one shared start schedule to every configured room.
              </Text>
            </View>
          </View>
          <Text style={[styles.fieldLabel, { color: c.text }]}>
            Shared schedule date
          </Text>
          <Pressable
            onPress={() => {
              const [year, month] = allScheduleDate.split("-").map(Number);
              setCalendarMonth(new Date(year, month - 1, 1));
              setDatePickerTarget("all");
            }}
            style={[
              styles.datePickerButton,
              { borderColor: c.line, backgroundColor: c.bg },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Shared schedule date: ${formatScheduleDate(allScheduleDate)}`}
          >
            <View style={styles.datePickerButtonContent}>
              <Ionicons name="calendar-outline" size={18} color={c.accent} />
              <Text style={[styles.copy, { color: c.text }]}>
                {formatScheduleDate(allScheduleDate)}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={17} color={c.muted} />
          </Pressable>
          <Text style={[styles.fieldLabel, { color: c.text }]}>
            Shared start time (12-hour)
          </Text>
          <TextInput
            value={allScheduleTimeDraft}
            onChangeText={(value) => {
              setAllScheduleTimeDraft(value);
              setSharedScheduleDraftDirty(true);
              setSummary(null);
              setStatus(
                "The shared schedule will be applied to all rooms when you calculate the runtime plan.",
              );
              setError("");
            }}
            placeholder="08:00 PM"
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            style={[
              styles.input,
              { color: c.text, borderColor: c.line, backgroundColor: c.bg },
            ]}
            accessibilityLabel="Shared room schedule start time"
          />
          <Pressable
            disabled={rooms.length === 0}
            onPress={applyScheduleToAllRooms}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: c.accent,
                opacity: rooms.length === 0 ? 0.55 : pressed ? 0.88 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: rooms.length === 0 }}
          >
            <Text style={[styles.primaryButtonText, { color: c.bg }]}>
              Apply to all rooms
            </Text>
          </Pressable>
          {status === "The shared date and time were applied to all rooms." ? (
            <Text style={[styles.copy, { color: c.ok }]}>
              {status}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { color: c.muted }]}>
          CONFIGURED ROOMS · {rooms.length}
        </Text>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={c.accent} />
            <Text style={[styles.copy, { color: c.muted }]}>
              Loading room setup and live battery telemetry...
            </Text>
          </View>
        ) : null}
        {rooms.map((room) => {
          const expanded = expandedRoomChannels.has(room.channel);
          return (
            <View key={room.channel} style={[styles.card, panel]}>
              <Pressable
                onPress={() =>
                  setExpandedRoomChannels((current) => {
                    const next = new Set(current);
                    if (next.has(room.channel)) {
                      next.delete(room.channel);
                    } else {
                      next.add(room.channel);
                    }
                    return next;
                  })
                }
                style={styles.roomHeader}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${room.roomName} priority and schedule settings`}
              >
                <View
                  style={[styles.roomIcon, { backgroundColor: c.accentSoft }]}
                >
                  <Ionicons name="bulb-outline" size={18} color={c.text} />
                </View>
                <View style={styles.roomTitleGroup}>
                  <Text style={[styles.cardTitle, { color: c.text }]}>
                    {room.roomName}
                  </Text>
                  <Text style={[styles.copy, { color: c.muted }]}>
                    Relay channel {room.channel} · 1 bulb ·{" "}
                    {room.priority.toUpperCase()} priority
                  </Text>
                </View>
                <View
                  style={[
                    styles.wattageBadge,
                    {
                      backgroundColor:
                        room.watts !== null && room.watts > 0
                          ? c.accentSoft
                          : c.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.wattageBadgeText,
                      {
                        color:
                          room.watts !== null && room.watts > 0
                            ? c.text
                            : c.muted,
                      },
                    ]}
                  >
                    {room.watts === null || room.watts <= 0
                      ? "NOT MEASURED"
                      : `${room.watts.toFixed(1)} W`}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={c.muted}
                />
              </Pressable>
              {expanded ? (
                <>
                  <Text style={[styles.fieldLabel, { color: c.muted }]}>
                    PRIORITY
                  </Text>
                  <View style={styles.priorityRow}>
                    {(["high", "low"] as AllocationPriority[]).map(
                      (priority) => {
                        const selected = room.priority === priority;
                        return (
                          <Pressable
                            key={priority}
                            onPress={() =>
                              updateRoom(room.channel, { priority })
                            }
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            style={[
                              styles.priorityButton,
                              {
                                backgroundColor: selected
                                  ? c.accent
                                  : c.surfaceMuted,
                                borderColor: selected ? c.accent : c.line,
                              },
                            ]}
                          >
                            <View style={styles.priorityButtonContent}>
                              {selected ? (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={15}
                                  color={c.bg}
                                />
                              ) : null}
                              <Text
                                style={[
                                  styles.priorityText,
                                  { color: selected ? c.bg : c.text },
                                ]}
                              >
                                {priority.toUpperCase()}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                  <Text style={[styles.fieldLabel, { color: c.text }]}>
                    Schedule date
                  </Text>
                  <Pressable
                    onPress={() => {
                      const [year, month] = room.startDate
                        .split("-")
                        .map(Number);
                      setCalendarMonth(new Date(year, month - 1, 1));
                      setDatePickerTarget(room.channel);
                    }}
                    style={[
                      styles.datePickerButton,
                      { borderColor: c.line, backgroundColor: c.bg },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${room.roomName} schedule date: ${formatScheduleDate(room.startDate)}`}
                  >
                    <View style={styles.datePickerButtonContent}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={c.accent}
                      />
                      <Text style={[styles.copy, { color: c.text }]}>
                        {formatScheduleDate(room.startDate)}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={c.muted}
                    />
                  </Pressable>
                  <Text style={[styles.fieldLabel, { color: c.text }]}>
                    Start time (12-hour)
                  </Text>
                  <TextInput
                    value={
                      startTimeDrafts[room.channel] ??
                      formatStartTimeForInput(room.startTime)
                    }
                    onChangeText={(value) => {
                      setStartTimeDrafts((current) => ({
                        ...current,
                        [room.channel]: value,
                      }));
                      setSummary(null);
                      setError("");
                    }}
                    onBlur={() => {
                      const draft = startTimeDrafts[room.channel] ?? "";
                      const parsed = parseStartTimeFromInput(draft);
                      if (parsed) {
                        updateRoom(room.channel, { startTime: parsed });
                        setStartTimeDrafts((current) => ({
                          ...current,
                          [room.channel]: formatStartTimeForInput(parsed),
                        }));
                      }
                    }}
                    placeholder="08:00 PM"
                    maxLength={8}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    keyboardType="default"
                    style={[
                      styles.input,
                      {
                        color: c.text,
                        borderColor: c.line,
                        backgroundColor: c.bg,
                      },
                    ]}
                    accessibilityLabel={`${room.roomName} schedule start time`}
                  />
                </>
              ) : null}
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { color: c.muted }]}>
          BATTERY &amp; SAFETY
        </Text>
        <Pressable
          onPress={() => setBatteryInfoModalVisible(true)}
          style={({ pressed }) => [
            styles.card,
            panel,
            {
              backgroundColor: pressed ? c.surfaceMuted : c.surface,
              flexDirection: "row",
              alignItems: "center",
              gap: scale(12),
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open battery reserve overview"
        >
          <View style={[styles.roomIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="battery-charging-outline" size={19} color={c.text} />
          </View>
          <View style={styles.roomTitleGroup}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Battery reserve overview
            </Text>
            <Text style={[styles.copy, { color: c.muted }]}>
              {allocationSocPercent === null
                ? "Battery: waiting for telemetry"
                : `${hardwareTestSettings?.enabled ? "Simulated" : "Live"} battery: ${allocationSocPercent.toFixed(1)}% · Tap for capacity details`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>

        {error && !scanModalVisible ? (
          <Text style={[styles.status, { color: c.danger }]}>{error}</Text>
        ) : null}

        {!loading && rooms.length > 0 ? (
          <View style={[styles.measureCard, panel]}>
            <View style={styles.roomHeader}>
              <View style={[styles.roomIcon, { backgroundColor: c.accentSoft }]}>
                <Ionicons name="flash-outline" size={18} color={c.text} />
              </View>
              <View style={styles.roomTitleGroup}>
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Measure bulb wattage
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  Scans every room, whether priority is HIGH or LOW.
                </Text>
              </View>
            </View>
            <Pressable
              disabled={measuring || !mqttConnected}
              onPress={() => void requestWattScan()}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: c.accent,
                  opacity: measuring || !mqttConnected ? 0.55 : pressed ? 0.88 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Measure bulb wattage for all configured rooms"
            >
              {measuring ? (
                <ActivityIndicator color={c.bg} />
              ) : (
                <View style={styles.actionButtonContent}>
                  <Ionicons name="bulb-outline" size={17} color={c.bg} />
                  <Text style={[styles.primaryButtonText, { color: c.bg }]}>
                    {mqttConnected ? "Measure all room bulbs" : "Connecting to hub..."}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        ) : null}

        <Pressable
          disabled={
            loading ||
            measuring ||
            savingPlan ||
            !hardwareTestSettingsLoaded ||
            Boolean(hardwareTestSettingsError) ||
            allocationSocPercent === null
          }
          onPress={() => void calculatePlan()}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: c.accent,
              opacity:
                loading ||
                measuring ||
                savingPlan ||
                !hardwareTestSettingsLoaded ||
                Boolean(hardwareTestSettingsError) ||
                allocationSocPercent === null
                  ? 0.55
                  : pressed
                    ? 0.88
                    : 1,
            },
          ]}
        >
          {savingPlan ? (
            <ActivityIndicator color={c.bg} />
          ) : (
            <View style={styles.actionButtonContent}>
              <Ionicons name="analytics-outline" size={17} color={c.bg} />
              <Text style={[styles.primaryButtonText, { color: c.bg }]}>
                Calculate runtime plan
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          disabled={
            loading ||
            measuring ||
            savingPlan ||
            !rootNavigationState?.key
          }
          onPress={() => {
            if (rootNavigationState?.key) router.replace("/home");
          }}
          accessibilityRole="button"
          style={[
            styles.skipButton,
            {
              backgroundColor: c.surface,
              borderColor: c.line,
              opacity:
                loading ||
                measuring ||
                savingPlan ||
                !rootNavigationState?.key
                  ? 0.55
                  : 1,
            },
          ]}
        >
          <Text style={[styles.skipButtonText, { color: c.text }]}>
            {rooms.some((room) => room.watts === null || room.watts <= 0)
              ? "Skip Watt Scan and Go to Dashboard"
              : "Go to Dashboard"}
          </Text>
        </Pressable>

        {summary ? (
          <Pressable
            onPress={() => setScheduleModalVisible(true)}
            style={[styles.card, styles.schedulePreview, panel]}
            accessibilityRole="button"
            accessibilityLabel="View readable projected schedule"
          >
            <View style={styles.schedulePreviewText}>
              <Text style={[styles.cardTitle, { color: c.text }]}>
                Projected schedule ready
              </Text>
              <Text style={[styles.copy, { color: c.muted }]}>
                {summary.rooms.length} rooms ·{" "}
                {summary.budgets.totalAllocatedWh.toFixed(2)} Wh allocated
                {summary.battery.isTheoreticalEstimate
                  ? " · full-charge estimate"
                  : ""}
              </Text>
              <Text style={[styles.copy, { color: c.accent }]}>
                Tap to view the schedule
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.accent} />
          </Pressable>
        ) : null}
      </View>
      <Modal
        visible={datePickerTarget !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setDatePickerTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: c.surface,
                borderColor: c.line,
                width: "100%",
                alignItems: "stretch",
              },
            ]}
            accessibilityViewIsModal
          >
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {datePickerTarget === "all"
                ? "Choose date for all rooms"
                : "Choose schedule date"}
            </Text>
            <View style={styles.calendarHeader}>
              <Pressable
                onPress={() =>
                  setCalendarMonth(
                    new Date(calendarYear, calendarMonthIndex - 1, 1),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color={c.text} />
              </Pressable>
              <Text style={[styles.cardTitle, { color: c.text }]}>
                {new Intl.DateTimeFormat(undefined, {
                  month: "long",
                  year: "numeric",
                }).format(calendarMonth)}
              </Text>
              <Pressable
                onPress={() =>
                  setCalendarMonth(
                    new Date(calendarYear, calendarMonthIndex + 1, 1),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Next month"
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={22} color={c.text} />
              </Pressable>
            </View>
            <View style={styles.calendarWeek}>
              {["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => (
                <Text
                  key={`${weekday}-${index}`}
                  style={[styles.calendarWeekday, { color: c.muted }]}
                >
                  {weekday}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {calendarWeeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.calendarWeek}>
                  {week.map((day, dayIndex) => {
                    if (day === null) {
                      return (
                        <View
                          key={`blank-${weekIndex}-${dayIndex}`}
                          style={styles.calendarDayCell}
                        />
                      );
                    }
                    const dateKey = formatDateKey(
                      new Date(calendarYear, calendarMonthIndex, day),
                    );
                    const selected = datePickerSelectedDate === dateKey;
                    const disabled = dateKey < todayDateKey;
                    return (
                      <Pressable
                        key={dateKey}
                        disabled={disabled}
                        onPress={() => {
                          if (datePickerTarget === "all") {
                            setAllScheduleDate(dateKey);
                            setSharedScheduleDraftDirty(true);
                            setSummary(null);
                            setStatus(
                              "The shared schedule will be applied to all rooms when you calculate the runtime plan.",
                            );
                            setError("");
                          } else if (datePickerTarget !== null) {
                            updateRoom(datePickerTarget, { startDate: dateKey });
                          }
                          setDatePickerTarget(null);
                        }}
                        style={styles.calendarDayCell}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                        accessibilityLabel={`Select ${formatScheduleDate(dateKey)}`}
                      >
                        <View
                          style={[
                            styles.calendarDay,
                            {
                              backgroundColor: selected
                                ? c.accent
                                : c.surfaceMuted,
                              borderColor: selected ? c.accent : c.line,
                              opacity: disabled ? 0.4 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              { color: selected ? c.bg : c.text },
                            ]}
                          >
                            {day}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            <Text style={[styles.copy, { color: c.muted }]}>
              {datePickerTarget === "all"
                ? "Select the shared start date for all rooms."
                : "Select the date when this room should start."}
            </Text>
            <Pressable
              onPress={() => setDatePickerTarget(null)}
              style={styles.modalSecondaryButton}
              accessibilityRole="button"
            >
              <Text style={[styles.modalSecondaryText, { color: c.text }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={scanModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!measuring) setScanModalVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: c.surface,
                borderColor: error ? c.danger : c.line,
                width: "100%",
                maxHeight: "86%",
                alignItems: "stretch",
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.scanModalHeading}>
              {measuring ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <Ionicons
                  name={error ? "alert-circle-outline" : "checkmark-circle-outline"}
                  size={22}
                  color={error ? c.danger : c.accent}
                />
              )}
              <Text style={[styles.cardTitle, { color: c.text }]}>
                {measuring
                  ? "Measuring room wattage"
                  : error
                    ? "Watt scan needs attention"
                    : "Room wattage measured"}
              </Text>
            </View>
            <Text style={[styles.copy, { color: c.muted }]}>
              {measuring
                ? status || "Preparing the room scan..."
                : error || status || "Watt measurements are saved."}
            </Text>
            <View style={styles.scanProgressHeader}>
              <Text style={[styles.copy, { color: c.muted }]}>
                {activeScanRoom
                  ? `${measuring ? "Current room" : "Last room"}: ${activeScanRoom}`
                  : measuring
                    ? "Preparing the room scan..."
                    : `${scanReadings.length} room${scanReadings.length === 1 ? "" : "s"} measured`}
              </Text>
              <Text style={[styles.copy, { color: c.muted }]}>
                {scanProgress}%
              </Text>
            </View>
            <View
              style={[styles.progressTrack, { backgroundColor: c.line }]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: error ? c.danger : c.accent,
                    width: `${scanProgress}%`,
                  },
                ]}
              />
            </View>
            <ScrollView
              style={styles.scanReadingsList}
              contentContainerStyle={styles.scanReadingsContent}
              showsVerticalScrollIndicator
            >
              {scanReadings.map((reading) => (
                <View
                  key={reading.channel}
                  style={[styles.scanReading, { borderColor: c.line }]}
                >
                  <Text style={[styles.resultTitle, { color: c.text }]}>
                    {reading.roomName}
                  </Text>
                  <Text style={[styles.scanReadingWatts, { color: c.accent }]}>
                    {reading.watts.toFixed(2)} W
                  </Text>
                </View>
              ))}
            </ScrollView>
            <Text style={[styles.modalHint, { color: c.muted }]}>
              Each bulb briefly turns on while its wattage is measured.
            </Text>
            {!measuring ? (
              <Pressable
                onPress={() => setScanModalVisible(false)}
                style={[styles.modalPrimaryButton, { backgroundColor: c.text }]}
                accessibilityRole="button"
              >
                <Text style={[styles.modalButtonText, { color: c.bg }]}>
                  Close
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
      <Modal
        visible={scheduleModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setScheduleModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.scheduleModalCard,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
            accessibilityViewIsModal
          >
            <ScrollView
              style={styles.scheduleModalScroll}
              contentContainerStyle={styles.scheduleModalContent}
              showsVerticalScrollIndicator
            >
              <View style={styles.scheduleModalHeader}>
                <View style={styles.schedulePreviewText}>
                  <Text style={[styles.heading, { color: c.text }]}>
                    Projected lighting schedule
                  </Text>
                  <Text style={[styles.copy, { color: c.muted }]}>
                    Times are shown in your local time with AM/PM.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setScheduleModalVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close projected schedule"
                  hitSlop={8}
                >
                  <Ionicons name="close" size={24} color={c.text} />
                </Pressable>
              </View>

              {summary ? (
                <>
                  {calculationContext?.adminTestMode ? (
                    <View
                      style={[
                        styles.scheduleInfoCard,
                        { backgroundColor: c.accentSoft, borderColor: c.line },
                      ]}
                    >
                      <Text style={[styles.cardTitle, { color: c.text }]}>
                        Test settings used for this estimate
                      </Text>
                      <Text style={[styles.copy, { color: c.muted }]}>
                        Battery: {calculationContext.batteryPercentage.toFixed(1)}% · Runtime
                        reference time (not a room start):{" "}
                        {formatScheduleTime(calculationContext.referenceTime)}
                      </Text>
                    </View>
                  ) : null}
                  {summary.battery.isTheoreticalEstimate ? (
                    <View
                      style={[
                        styles.scheduleNotice,
                        { backgroundColor: `${c.orange}18`, borderColor: c.orange },
                      ]}
                    >
                      <Text style={[styles.cardTitle, { color: c.orange }]}>
                        Theoretical full-charge estimate
                      </Text>
                      <Text style={[styles.copy, { color: c.text }]}>
                        Current charge is{" "}
                        {summary.battery.initialSocPercent.toFixed(1)}%. This
                        schedule assumes a 100% starting charge and does not
                        switch relays.
                      </Text>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.scheduleInfoCard,
                      { backgroundColor: c.surfaceMuted, borderColor: c.line },
                    ]}
                  >
                    <Text style={[styles.cardTitle, { color: c.text }]}>
                      Battery overview
                    </Text>
                    <Text style={[styles.copy, { color: c.muted }]}>
                      Current charge:{" "}
                      {summary.battery.initialSocPercent.toFixed(1)}% · Usable
                      capacity: {summary.battery.usableWh.toFixed(2)} Wh
                    </Text>
                    <Text style={[styles.copy, { color: c.muted }]}>
                      Available now: {summary.battery.availableNowWh.toFixed(2)}{" "}
                      Wh · Runtime budget:{" "}
                      {summary.battery.runtimeBudgetWh.toFixed(2)} Wh · Safe
                      reserve:{" "}
                      {summary.battery.reservedSafeZoneWh.toFixed(2)} Wh
                    </Text>
                    <Text style={[styles.metric, { color: c.text }]}>
                      Projected charge after schedule:{" "}
                      {summary.battery.finalProjectedSocPercent.toFixed(1)}%
                      {summary.battery.isTheoreticalEstimate
                        ? " (assuming 100% start)"
                        : ""}
                    </Text>
                  </View>

                  <Text style={[styles.sectionTitle, { color: c.text }]}>
                    ROOM SCHEDULE
                  </Text>
                  {summary.rooms.map((room) => (
                    <View
                      key={room.channel}
                      style={[
                        styles.scheduleRoomCard,
                        { backgroundColor: c.surfaceMuted, borderColor: c.line },
                      ]}
                    >
                      <View style={styles.scheduleModalHeader}>
                        <Text style={[styles.cardTitle, { color: c.text }]}>
                          {room.roomName}
                        </Text>
                        <Text
                          style={[
                            styles.priorityText,
                            { color: room.priority === "high" ? c.text : c.muted },
                          ]}
                        >
                          {room.priority.toUpperCase()} PRIORITY
                        </Text>
                      </View>
                      <Text style={[styles.copy, { color: c.muted }]}>
                        {room.watts.toFixed(2)} W bulb ·{" "}
                        {room.energyWh.toFixed(2)} Wh allocated ·{" "}
                        {formatDuration(room.runtimeHours)} runtime
                      </Text>
                      <Text style={[styles.scheduleTime, { color: c.text }]}>
                        Turns on: {formatScheduleTime(room.startAt)}
                      </Text>
                      <Text style={[styles.scheduleTime, { color: c.text }]}>
                        Turns off: {formatScheduleTime(room.shutoffAt)}
                      </Text>
                    </View>
                  ))}

                  <View
                    style={[
                      styles.scheduleInfoCard,
                      { backgroundColor: c.surfaceMuted, borderColor: c.line },
                    ]}
                  >
                    <Text style={[styles.cardTitle, { color: c.text }]}>
                      Priority energy budgets
                    </Text>
                    <Text style={[styles.copy, { color: c.muted }]}>
                      HIGH: {summary.budgets.E_high.toFixed(2)} Wh · LOW:{" "}
                      {summary.budgets.E_low.toFixed(2)} Wh · Total:{" "}
                      {summary.budgets.totalAllocatedWh.toFixed(2)} Wh
                    </Text>
                  </View>

                  {summary.concurrentPhases ? (
                    <View
                      style={[
                        styles.scheduleInfoCard,
                        { backgroundColor: c.surfaceMuted, borderColor: c.line },
                      ]}
                    >
                      <Text style={[styles.cardTitle, { color: c.text }]}>
                        Concurrent operation
                      </Text>
                      <Text style={[styles.copy, { color: c.muted }]}>
                        Both rooms run together for{" "}
                        {formatDuration(summary.concurrentPhases.concurrentHours)}.
                        The LOW-priority room then turns off; the HIGH-priority
                        room continues alone for{" "}
                        {formatDuration(summary.concurrentPhases.highSoloHours)}.
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              <Text style={[styles.copy, { color: c.muted }]}>
                This is a projection only; it will not switch relays at the
                displayed times.
              </Text>
            </ScrollView>
            <View style={styles.scheduleModalActions}>
              <Pressable
                onPress={() => setScheduleModalVisible(false)}
                style={styles.modalSecondaryButton}
                accessibilityRole="button"
              >
                <Text style={[styles.modalSecondaryText, { color: c.text }]}>
                  Close Schedule
                </Text>
              </Pressable>
              {canStartAllocation ? (
                <Pressable
                  disabled={startingAllocation}
                  onPress={startAllocation}
                  style={[
                    styles.modalPrimaryButton,
                    {
                      backgroundColor: c.accent,
                      marginTop: 0,
                      opacity: startingAllocation ? 0.55 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: startingAllocation }}
                  accessibilityLabel="Start allocation using the calculated runtime plan"
                >
                  <Text style={[styles.modalButtonText, { color: c.bg }]}>
                    {startingAllocation ? "Saving allocation..." : "Start Allocate"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={allocationSettingsModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAllocationSettingsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: c.surface,
                borderColor: c.line,
                width: "100%",
                maxHeight: "86%",
                alignItems: "stretch",
              },
            ]}
            accessibilityViewIsModal
          >
            <ScrollView
              style={{ alignSelf: "stretch" }}
              contentContainerStyle={{ gap: scale(10) }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ alignItems: "center", gap: scale(10) }}>
                <View
                  style={[
                    styles.modalIconWrap,
                    { backgroundColor: c.accentSoft },
                  ]}
                >
                  <Ionicons name="options-outline" size={30} color={c.text} />
                </View>
                <Text style={[styles.modalTitle, { color: c.text }]}>
                  Allocation Settings
                </Text>
                <Text style={[styles.modalBody, { color: c.muted }]}>
                  Adjust inverter efficiency and the share reserved for HIGH
                  priority rooms.
                </Text>
              </View>
              <Text style={[styles.fieldLabel, { color: c.text }]}>
                Inverter efficiency (0–1; use 1 for DC)
              </Text>
              <TextInput
                value={inverterEfficiency}
                onChangeText={(value) => {
                  setInverterEfficiency(value);
                  setSummary(null);
                }}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  {
                    color: c.text,
                    borderColor: c.line,
                    backgroundColor: c.bg,
                  },
                ]}
                accessibilityLabel="Inverter efficiency from zero to one"
              />
              <Text style={[styles.fieldLabel, { color: c.text }]}>
                HIGH priority share (%)
              </Text>
              <TextInput
                value={highWeightPercent}
                onChangeText={(value) => {
                  setHighWeightPercent(value);
                  setSummary(null);
                }}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  {
                    color: c.text,
                    borderColor: c.line,
                    backgroundColor: c.bg,
                  },
                ]}
                accessibilityLabel="High priority energy budget percentage"
              />
              <Text style={[styles.copy, { color: c.muted }]}>
                LOW receives the remainder so both weights total 100%. A tier
                running alone receives the full available budget; each tier&apos;s
                budget is divided evenly among its rooms.
              </Text>
            </ScrollView>
            <Pressable
              onPress={() => setAllocationSettingsModalVisible(false)}
              style={[styles.modalPrimaryButton, { backgroundColor: c.text }]}
              accessibilityRole="button"
            >
              <Text style={[styles.modalButtonText, { color: c.bg }]}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={batteryInfoModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setBatteryInfoModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
            accessibilityViewIsModal
          >
            <View
              style={[
                styles.modalIconWrap,
                { backgroundColor: c.accentSoft },
              ]}
            >
              <Ionicons
                name="battery-charging-outline"
                size={32}
                color={c.text}
              />
            </View>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              Battery Reserve Overview
            </Text>
            <ScrollView
              style={{ alignSelf: "stretch", maxHeight: scale(360) }}
              contentContainerStyle={{ gap: scale(10) }}
            >
              <View
                style={[
                  styles.scheduleInfoCard,
                  { backgroundColor: c.surfaceMuted, borderColor: c.line },
                ]}
              >
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Nominal capacity
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  768 Wh · 12.8 V × 60 Ah
                </Text>
              </View>
              <View
                style={[
                  styles.scheduleInfoCard,
                  { backgroundColor: c.surfaceMuted, borderColor: c.line },
                ]}
              >
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Protected safe reserve
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  20% · 153.6 Wh nominal. The planner will not allocate energy
                  from this reserve.
                </Text>
              </View>
              <View
                style={[
                  styles.scheduleInfoCard,
                  { backgroundColor: c.surfaceMuted, borderColor: c.line },
                ]}
              >
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Usable energy at configured efficiency
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  {batteryUsableWh === null
                    ? "Enter a valid inverter efficiency from 0 to 1."
                    : `${batteryUsableWh.toFixed(2)} Wh · 80% maximum DoD × ${(efficiencyValue * 100).toFixed(0)}% efficiency`}
                </Text>
              </View>
              <View
                style={[
                  styles.scheduleInfoCard,
                  { backgroundColor: c.surfaceMuted, borderColor: c.line },
                ]}
              >
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Room schedule for this calculation
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  Shared draft: {formatScheduleDate(allScheduleDate)} at{" "}
                  {allScheduleTimeDraft}
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  {sharedScheduleNeedsApply
                    ? "This shared draft will be applied to all rooms when you calculate the runtime plan."
                    : rooms.length === 0
                      ? "No room schedules are configured."
                      : parseStartTimeFromInput(allScheduleTimeDraft) === null
                        ? "Enter a valid shared start time before applying the schedule."
                        : "These room schedules are used for the next runtime calculation."}
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  {rooms.length > 0
                    ? rooms
                        .map(
                          (room) =>
                            `${room.roomName}: ${formatScheduleDate(room.startDate)} at ${formatStartTimeForInput(room.startTime)}`,
                        )
                        .join("\n")
                    : "No room schedules are configured."}
                </Text>
              </View>
              <View
                style={[
                  styles.scheduleInfoCard,
                  { backgroundColor: c.surfaceMuted, borderColor: c.line },
                ]}
              >
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Battery state used for planning
                </Text>
                <Text style={[styles.copy, { color: c.muted }]}>
                  {allocationSocPercent === null
                    ? "Waiting for telemetry"
                    : `${hardwareTestSettings?.enabled ? "Simulated" : "Live"} SOC: ${allocationSocPercent.toFixed(1)}% · ${batteryAvailableNowWh?.toFixed(2) ?? "—"} Wh available above the reserve`}
                </Text>
                {hardwareTestSettings?.enabled ? (
                  <Text style={[styles.copy, { color: c.muted }]}>
                    Runtime reference time (admin test mode, not a room
                    schedule): {applicationDate.toLocaleString()}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
            <Pressable
              onPress={() => setBatteryInfoModalVisible(false)}
              style={[styles.modalPrimaryButton, { backgroundColor: c.text }]}
              accessibilityRole="button"
            >
              <Text style={[styles.modalButtonText, { color: c.bg }]}>
                Close Overview
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={theoreticalEstimateModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setTheoreticalEstimateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.surface, borderColor: c.orange },
            ]}
            accessibilityRole="alert"
            accessibilityViewIsModal
          >
            <View
              style={[
                styles.modalIconWrap,
                { backgroundColor: `${c.orange}18` },
              ]}
            >
              <Ionicons name="battery-dead" size={34} color={c.orange} />
            </View>
            <Text style={[styles.modalTitle, { color: c.orange }]}>
              Confirm theoretical estimate
            </Text>
            <Text style={[styles.modalBody, { color: c.text }]}>
              Battery is at {allocationSocPercent?.toFixed(1)}%, at or below the
              20% safe reserve. Continue to calculate a theoretical runtime
              using a fully charged battery (100% SOC) and its usable capacity?
            </Text>
            <Text style={[styles.modalHint, { color: c.muted }]}>
              This only calculates a simulation; it does not apply a schedule
              or switch relays. The estimated energy is not available at the
              current charge. Recharge above 20% before using the plan.
            </Text>
            <Pressable
              onPress={() => {
                setTheoreticalEstimateModalVisible(false);
                const startAsSoonAsPossible =
                  calculateImmediateStartAfterEstimateRef.current;
                calculateImmediateStartAfterEstimateRef.current = false;
                void calculatePlan(true, startAsSoonAsPossible);
              }}
              style={[
                styles.modalPrimaryButton,
                { backgroundColor: c.text },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.modalButtonText, { color: c.bg }]}>
                Calculate theoretical estimate
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                calculateImmediateStartAfterEstimateRef.current = false;
                setTheoreticalEstimateModalVisible(false);
              }}
              style={styles.modalSecondaryButton}
              accessibilityRole="button"
            >
              <Text style={[styles.modalSecondaryText, { color: c.text }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={pastScheduleError.length > 0}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPastScheduleError("")}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
            accessibilityRole="alert"
            accessibilityViewIsModal
          >
            <View
              style={[
                styles.modalIconWrap,
                { backgroundColor: `${c.orange}18` },
              ]}
            >
              <Ionicons name="time-outline" size={34} color={c.orange} />
            </View>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              Scheduled start has passed
            </Text>
            <Text style={[styles.modalBody, { color: c.text }]}>
              {pastScheduleError}
            </Text>
            <Text style={[styles.modalHint, { color: c.muted }]}>
              Choose a future date and time, or set both rooms to start in two
              minutes and recalculate. You will still review and start the
              allocation from the runtime plan.
            </Text>
            <Pressable
              onPress={() => {
                setPastScheduleError("");
                void calculatePlan(false, true);
              }}
              style={[
                styles.modalPrimaryButton,
                { backgroundColor: c.text },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Set the allocation to start as soon as possible and recalculate"
            >
              <Text style={[styles.modalButtonText, { color: c.bg }]}>
                Start as soon as possible
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPastScheduleError("");
                setStatus(
                  "Choose a future date and time for each room, then calculate the runtime again.",
                );
              }}
              style={styles.modalSecondaryButton}
              accessibilityRole="button"
            >
              <Text style={[styles.modalSecondaryText, { color: c.text }]}>
                Choose a future schedule
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPastScheduleError("")}
              style={styles.modalSecondaryButton}
              accessibilityRole="button"
            >
              <Text style={[styles.modalSecondaryText, { color: c.muted }]}>
                Not now
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={powerModeModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPowerModeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
            accessibilityRole="alert"
            accessibilityViewIsModal
          >
            <View
              style={[
                styles.modalIconWrap,
                { backgroundColor: `${c.orange}18` },
              ]}
            >
              <Ionicons name="flash" size={34} color={c.orange} />
            </View>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              Grid or Battery Required
            </Text>
            <Text style={[styles.modalBody, { color: c.muted }]}>
              {powerModeModalMessage}
            </Text>
            <Text style={[styles.modalHint, { color: c.text }]}>
              Choose Grid or Battery from the dashboard power controls. Watt
              scanning will be available after the hub confirms the mode.
            </Text>
            <Pressable
              disabled={!rootNavigationState?.key}
              onPress={() => {
                setPowerModeModalVisible(false);
                if (rootNavigationState?.key) router.replace("/home");
              }}
              style={[
                styles.modalPrimaryButton,
                {
                  backgroundColor: c.text,
                  opacity: rootNavigationState?.key ? 1 : 0.55,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.modalButtonText, { color: c.bg }]}>
                Go to Dashboard Power Controls
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPowerModeModalVisible(false)}
              style={styles.modalSecondaryButton}
              accessibilityRole="button"
            >
              <Text style={[styles.modalSecondaryText, { color: c.text }]}>
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SystemAllocationShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: scale(8),
    paddingBottom: scale(26),
    gap: scale(10),
  },
  heading: {
    fontSize: scale(22),
    lineHeight: scale(28),
    fontFamily: fonts.extrabold,
  },
  pageHeading: {
    fontSize: scale(18),
    lineHeight: scale(24),
  },
  sectionTitle: {
    fontSize: scale(11),
    letterSpacing: 1.2,
    fontFamily: fonts.extrabold,
    marginTop: scale(10),
    marginBottom: scale(4),
  },
  card: {
    borderWidth: 1,
    borderRadius: scale(16),
    padding: scale(14),
    gap: scale(8),
    marginBottom: scale(8),
  },
  cardTitle: {
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  copy: {
    fontSize: scale(11),
    lineHeight: scale(16),
    fontFamily: fonts.medium,
  },
  metric: {
    fontSize: scale(12),
    fontFamily: fonts.semibold,
  },
  fieldLabel: {
    fontSize: scale(11),
    fontFamily: fonts.semibold,
    marginTop: scale(5),
  },
  input: {
    minHeight: scale(42),
    borderWidth: 1,
    borderRadius: scale(10),
    paddingHorizontal: scale(11),
    fontSize: scale(13),
    fontFamily: fonts.medium,
  },
  datePickerButton: {
    minHeight: scale(42),
    borderWidth: 1,
    borderRadius: scale(10),
    paddingHorizontal: scale(11),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  datePickerButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
  },
  priorityRow: {
    flexDirection: "row",
    gap: scale(8),
  },
  priorityButton: {
    flex: 1,
    minHeight: scale(42),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: scale(12),
    paddingVertical: scale(9),
    paddingHorizontal: scale(12),
  },
  priorityButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
  },
  priorityText: {
    fontSize: scale(11),
    fontFamily: fonts.bold,
  },
  primaryButton: {
    minHeight: scale(48),
    borderRadius: scale(14),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(14),
    marginTop: scale(4),
  },
  actionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(9),
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: scale(12),
    fontFamily: fonts.bold,
  },
  roomHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
  },
  roomTitleGroup: {
    flex: 1,
    gap: scale(3),
  },
  roomIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: "center",
    justifyContent: "center",
  },
  wattageBadge: {
    borderRadius: scale(10),
    paddingHorizontal: scale(9),
    paddingVertical: scale(6),
  },
  wattageBadgeText: {
    fontSize: scale(9),
    letterSpacing: 0.35,
    fontFamily: fonts.extrabold,
  },
  scanModalHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
  },
  measureCard: {
    borderWidth: 1,
    borderRadius: scale(16),
    padding: scale(14),
    gap: scale(8),
    marginBottom: scale(8),
  },
  skipButton: {
    minHeight: scale(44),
    borderWidth: 1,
    borderRadius: scale(12),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(14),
  },
  skipButtonText: {
    fontSize: scale(11),
    fontFamily: fonts.semibold,
  },
  status: {
    fontSize: scale(11),
    lineHeight: scale(16),
    fontFamily: fonts.semibold,
  },
  scanProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: scale(8),
  },
  scanReadingsList: {
    maxHeight: scale(220),
  },
  scanReadingsContent: {
    gap: scale(8),
  },
  scanReading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: scale(10),
    padding: scale(10),
  },
  scanReadingWatts: {
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
  },
  progressTrack: {
    height: scale(7),
    overflow: "hidden",
    borderRadius: scale(8),
  },
  progressFill: {
    height: "100%",
    borderRadius: scale(8),
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: scale(24),
    backgroundColor: "rgba(10, 15, 20, 0.72)",
  },
  scheduleModalCard: {
    width: "100%",
    maxHeight: "92%",
    borderWidth: 1,
    borderRadius: scale(20),
    overflow: "hidden",
  },
  scheduleModalScroll: {
    flexShrink: 1,
  },
  scheduleModalContent: {
    padding: scale(16),
    gap: scale(12),
  },
  scheduleModalActions: {
    paddingHorizontal: scale(16),
    paddingTop: scale(6),
    paddingBottom: scale(14),
    gap: scale(8),
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarGrid: {
    gap: scale(3),
  },
  calendarWeek: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: scale(3),
  },
  calendarWeekday: {
    flex: 1,
    textAlign: "center",
    fontSize: scale(11),
    fontFamily: fonts.semibold,
  },
  calendarDayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: scale(2),
  },
  calendarDay: {
    width: scale(34),
    height: scale(34),
    borderWidth: 1,
    borderRadius: scale(17),
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayText: {
    fontSize: scale(12),
    fontFamily: fonts.semibold,
  },
  scheduleModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: scale(10),
  },
  schedulePreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  schedulePreviewText: {
    flex: 1,
    gap: scale(4),
  },
  scheduleNotice: {
    borderWidth: 1,
    borderRadius: scale(12),
    padding: scale(12),
    gap: scale(6),
  },
  scheduleInfoCard: {
    borderWidth: 1,
    borderRadius: scale(12),
    padding: scale(12),
    gap: scale(6),
  },
  scheduleRoomCard: {
    borderWidth: 1,
    borderRadius: scale(12),
    padding: scale(12),
    gap: scale(7),
  },
  scheduleTime: {
    fontSize: scale(12),
    lineHeight: scale(18),
    fontFamily: fonts.semibold,
  },
  modalCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: scale(22),
    paddingHorizontal: scale(22),
    paddingVertical: scale(24),
    gap: scale(12),
  },
  modalIconWrap: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: scale(18),
    lineHeight: scale(24),
    textAlign: "center",
    fontFamily: fonts.extrabold,
  },
  modalBody: {
    fontSize: scale(13),
    lineHeight: scale(19),
    textAlign: "center",
    fontFamily: fonts.medium,
  },
  modalHint: {
    fontSize: scale(12),
    lineHeight: scale(18),
    textAlign: "center",
    fontFamily: fonts.semibold,
  },
  modalPrimaryButton: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: scale(12),
    marginTop: scale(4),
    paddingVertical: scale(12),
    paddingHorizontal: scale(12),
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: scale(12),
    textAlign: "center",
    fontFamily: fonts.bold,
  },
  modalSecondaryButton: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: scale(8),
  },
  modalSecondaryText: {
    fontSize: scale(12),
    fontFamily: fonts.semibold,
  },
  loading: {
    flexDirection: "row",
    gap: scale(8),
    alignItems: "center",
    paddingVertical: scale(8),
  },
  resultTitle: {
    fontSize: scale(12),
    fontFamily: fonts.bold,
  },
});
