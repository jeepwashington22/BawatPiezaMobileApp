import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  DeviceEventEmitter,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppText as Text } from "../app-text";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient as SvgGradient,
  Polygon,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import Paho from "paho-mqtt";
import { scale } from "../glass-ui";
import { type Mode, type ThemeColors } from "../../theme";
import { styles } from "./styles";
import {
  AllocationRecoveryModal,
  SectionLabel,
  ActionButton,
  ZoneCard,
  type AllocationRecoveryReason,
} from "./shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/api";
import {
  getChannelPriorityOption,
  type ChannelPriority,
} from "../../lib/device-priority";
import {
  fetchHardwareTestSettings,
  getApplicationDate,
  type HardwareTestSettings,
} from "../../lib/hardware-test-settings";
import { notifySystemAllocationEnded } from "../../lib/push-notifications";
import { describeApiFailure } from "../../lib/network";
import {
  clearSystemAllocationStatus,
  SYSTEM_ALLOCATION_PLAN_CALCULATED,
  SYSTEM_ALLOCATION_FORCE_STOP_REQUESTED,
  saveSystemAllocationStatus,
  SYSTEM_ALLOCATION_FORCE_STOPPED,
  loadSystemAllocationStatus,
  systemAllocationRequiresNewPlan,
} from "../../lib/system-allocation-status";
import {
  forceStopSystemAllocation,
  sendSystemAllocationStopCommands,
  trackSystemAllocationCommand,
} from "../../lib/system-allocation-runtime";
import { usePowerOverride } from "../../hooks/use-power-override";
import { SystemAllocationScreen } from "../../features/system-allocation/system-allocation-screen";
import {
  isAllocationSummary,
  requestSystemAllocation,
} from "../../features/system-allocation/allocation-api";
import type { AllocationSummary } from "../../features/system-allocation/types";

type ConfiguredChannel = {
  channel: number;
  roomName: string;
  priority: ChannelPriority;
  watts: number;
  startDate: string;
  startTime: string;
};

type ScheduledAllocationGroup = {
  at: number;
  applicationAt: number;
  channels: ConfiguredChannel[];
};

function AllocationBatteryIllustration({
  batteryPercent,
  accentColor,
  reserveColor,
}: {
  batteryPercent: number | null;
  accentColor: string;
  reserveColor: string;
}) {
  const usableFraction =
    batteryPercent === null
      ? 0
      : Math.min(1, Math.max(0, (batteryPercent - 20) / 80));
  const fillStart = 0.8 * (1 - usableFraction);
  const frontFillTopLeft = 55 + 84 * fillStart;
  const frontFillTopRight = 80 + 84 * fillStart;
  const sideFillTopLeft = 80 + 84 * fillStart;
  const sideFillTopRight = 50 + 84 * fillStart;
  const percentLabel =
    batteryPercent === null
      ? "--%"
      : `${Math.round(Math.min(100, Math.max(0, batteryPercent)))}%`;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 230 190">
      <Defs>
        <SvgGradient id="allocationBatteryFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accentColor} />
          <Stop offset="1" stopColor="#1B8EAD" />
        </SvgGradient>
      </Defs>
      <Ellipse cx="133" cy="169" rx="74" ry="12" fill="#0B2233" opacity={0.14} />
      <Polygon points="118,80 198,50 198,134 118,164" fill="#15364C" />
      <Polygon points="70,55 118,80 118,164 70,139" fill="#214C63" />
      <Polygon points="70,55 150,27 198,50 118,80" fill="#4B91A9" />
      <Polygon
        points="70,55 118,80 118,147 70,122"
        fill="#173B50"
        opacity={0.85}
      />
      <Polygon
        points={`70,${frontFillTopLeft} 118,${frontFillTopRight} 118,147 70,122`}
        fill="url(#allocationBatteryFill)"
      />
      <Polygon
        points="118,80 198,50 198,117 118,147"
        fill="#102F43"
        opacity={0.85}
      />
      <Polygon
        points={`118,${sideFillTopLeft} 198,${sideFillTopRight} 198,117 118,147`}
        fill="#167B99"
      />
      <Polygon points="70,122 118,147 118,164 70,139" fill={reserveColor} />
      <Polygon points="118,147 198,117 198,134 118,164" fill="#C77A1B" />
      <Polygon
        points="70,55 118,80 118,164 70,139"
        fill="none"
        stroke="#8BD8EF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Polygon
        points="118,80 198,50 198,134 118,164"
        fill="none"
        stroke="#8BD8EF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Polygon
        points="70,55 150,27 198,50 118,80"
        fill="none"
        stroke="#B5E8F4"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <SvgText
        x="158"
        y="107"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={16}
        fontWeight="700"
      >
        {percentLabel}
      </SvgText>
      <Polygon points="127,34 149,26 163,33 141,41" fill="#D9F3F8" />
      <Polygon points="141,41 163,33 163,39 141,47" fill="#75B4C7" />
    </Svg>
  );
}

function AllocationRuntimeClock({
  accentColor,
  faceColor,
}: {
  accentColor: string;
  faceColor: string;
}) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Circle
        cx="50"
        cy="50"
        r="40"
        fill={faceColor}
        stroke={accentColor}
        strokeWidth={4}
      />
      <Line
        x1="50"
        y1="50"
        x2="50"
        y2="27"
        stroke={accentColor}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Line
        x1="50"
        y1="50"
        x2="68"
        y2="60"
        stroke={accentColor}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Circle cx="50" cy="50" r="3" fill={accentColor} />
    </Svg>
  );
}

function matchesConfiguredSchedule(
  timestamp: number,
  channel: ConfiguredChannel,
  timeZone: string,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return (
    `${value("year")}-${value("month")}-${value("day")}` ===
      channel.startDate &&
    `${value("hour")}:${value("minute")}` === channel.startTime
  );
}

function formatConfiguredSchedule(startDate: string, startTime: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime)
  ) {
    return "Schedule not set";
  }
  const [year, month, day] = startDate.split("-").map(Number);
  const [hours, minutes] = startTime.split(":").map(Number);
  const scheduledAt = new Date(year, month - 1, day, hours, minutes);
  if (
    scheduledAt.getFullYear() !== year ||
    scheduledAt.getMonth() !== month - 1 ||
    scheduledAt.getDate() !== day
  ) {
    return "Schedule not set";
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledAt);
}

const RESERVED_POOL_PERCENTAGE = 20;
const USABLE_POOL_PERCENTAGE = 100 - RESERVED_POOL_PERCENTAGE;
const NOMINAL_BATTERY_WH = 12.8 * 60;
const MAX_TIMEOUT_MS = 2_147_483_647;

const batteryConfirmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(4, 17, 31, 0.68)",
    justifyContent: "center",
    alignItems: "center",
    padding: scale(20),
  },
  card: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderRadius: scale(22),
    padding: scale(20),
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    marginBottom: scale(12),
  },
  icon: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(14),
    alignItems: "center",
    justifyContent: "center",
  },
  details: {
    borderRadius: scale(14),
    padding: scale(14),
    marginVertical: scale(14),
    gap: scale(8),
  },
  actions: {
    gap: scale(10),
    marginTop: scale(10),
  },
  cancelButton: {
    minHeight: scale(48),
    borderRadius: scale(14),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

function isChannelPriority(value: unknown): value is ChannelPriority {
  return value === "low" || value === "high";
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function hasCompleteAllocationSetup(value: unknown) {
  if (!isRecord(value) || !isRecord(value.allocation_settings)) return false;
  const { high_priority_weight, low_priority_weight, inverter_efficiency } =
    value.allocation_settings;
  if (
    typeof high_priority_weight !== "number" ||
    high_priority_weight < 0 ||
    high_priority_weight > 1 ||
    typeof low_priority_weight !== "number" ||
    low_priority_weight < 0 ||
    low_priority_weight > 1 ||
    Math.abs(high_priority_weight + low_priority_weight - 1) > 0.000001 ||
    typeof inverter_efficiency !== "number" ||
    inverter_efficiency <= 0 ||
    inverter_efficiency > 1 ||
    !Array.isArray(value.channels) ||
    value.channels.length === 0
  ) {
    return false;
  }
  return value.channels.every((entry) => {
    if (!isRecord(entry)) return false;
    const priority = entry.allocation_priority ?? entry.priority_status;
    const watts =
      typeof entry.watts === "number"
        ? entry.watts
        : typeof entry.watts === "string"
          ? Number(entry.watts)
          : Number.NaN;
    return (
      typeof entry.channel === "number" &&
      Number.isInteger(entry.channel) &&
      Number.isFinite(watts) &&
      watts > 0 &&
      isChannelPriority(priority) &&
      typeof entry.start_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.start_date) &&
      typeof entry.start_time === "string" &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(entry.start_time)
    );
  });
}

function formatPercentage(value: number) {
  return Number(value.toFixed(1)).toString();
}

async function sendHubCommand(
  hubId: string,
  accessToken: string,
  command: Record<string, unknown>,
) {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/v1/telemetry/commands/${encodeURIComponent(hubId)}`,
      {
        method: "POST",
        timeoutMs: 10_000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      },
    );
  } catch (error) {
    throw new Error(
      describeApiFailure(
        error,
        "Could not reach the BawatPieza API to send the hub command.",
      ),
    );
  }
  if (response.ok) return;

  const result = await response.json().catch(() => null) as {
    message?: string;
    error?: string;
  } | null;
  throw new Error(
    result?.message ||
      result?.error ||
      `Hub command failed (${response.status}).`,
  );
}

export function Allocation({
  c,
  mode,
  batteryPct,
  batteryV,
  telemetryConnection,
  allocationStarted,
  onAllocationStartedChange,
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
  batteryV: number | null;
  telemetryConnection: "connecting" | "live" | "offline";
  allocationStarted: boolean;
  onAllocationStartedChange: (started: boolean) => void;
}) {
  const { assertPowerControlsAvailable } = usePowerOverride();
  const [channels, setChannels] = useState<ConfiguredChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<number | null>(null);
  const [allocs, setAllocs] = useState<Record<number, number>>({});
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [allocationSetupComplete, setAllocationSetupComplete] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [allocationStatus, setAllocationStatus] = useState("");
  const [pastScheduleError, setPastScheduleError] = useState<string | null>(null);
  const [allocationErrorModal, setAllocationErrorModal] = useState<string | null>(
    null,
  );
  const [highPriorityWeight, setHighPriorityWeight] = useState(0.7);
  const [inverterEfficiency, setInverterEfficiency] = useState(1);
  const [runtimeHoursByChannel, setRuntimeHoursByChannel] = useState<
    Record<number, number>
  >({});
  const [pendingAllocationSummary, setPendingAllocationSummary] =
    useState<AllocationSummary | null>(null);
  const [savedAllocationPlan, setSavedAllocationPlan] = useState<{
    calculatedAt: string;
    summary: AllocationSummary;
  } | null>(null);
  const [calculatingRuntime, setCalculatingRuntime] = useState(false);
  const [allocationProgress, setAllocationProgress] = useState<{
    label: string;
    percent: number;
  } | null>(null);
  const [stoppingAllocation, setStoppingAllocation] = useState(false);
  const [hardwareTestSettings, setHardwareTestSettings] =
    useState<HardwareTestSettings | null>(null);
  const [hardwareTestSettingsLoaded, setHardwareTestSettingsLoaded] =
    useState(false);
  const [hardwareTestSettingsError, setHardwareTestSettingsError] =
    useState("");
  const [systemAllocated, setSystemAllocated] = useState(false);
  const [forceStopAvailable, setForceStopAvailable] = useState(false);
  const [requiresNewPlan, setRequiresNewPlan] = useState(false);
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [recoveryModalReason, setRecoveryModalReason] =
    useState<AllocationRecoveryReason>("stopped");
  const [recoveryNoticeAcknowledged, setRecoveryNoticeAcknowledged] =
    useState(false);
  const allocationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledRelayStopTimersRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const pendingAutomaticStopsRef = useRef(0);
  const allocationClientRef = useRef<Paho.Client | null>(null);
  const allocationCommandInFlightRef = useRef<Promise<unknown> | null>(null);
  const scheduledAllocationGroupsRef = useRef<ScheduledAllocationGroup[]>([]);
  const allocationRunIdRef = useRef(0);
  const allocationEndNotificationSentRef = useRef(false);
  const autoStartAfterSetupRef = useRef(false);
  const allocationConfirmationPendingRef = useRef(false);
  const startAllocationHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const hardwareTestSettingsUpdatedAtRef = useRef("");

  const cancelScheduledAllocation = useCallback(() => {
    allocationRunIdRef.current += 1;
    scheduledAllocationGroupsRef.current = [];
    if (allocationTimerRef.current) {
      clearTimeout(allocationTimerRef.current);
      allocationTimerRef.current = null;
    }
    scheduledRelayStopTimersRef.current.forEach((timer) => clearTimeout(timer));
    scheduledRelayStopTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const requestSubscription = DeviceEventEmitter.addListener(
      SYSTEM_ALLOCATION_FORCE_STOP_REQUESTED,
      () => cancelScheduledAllocation(),
    );
    const subscription = DeviceEventEmitter.addListener(
      SYSTEM_ALLOCATION_FORCE_STOPPED,
      (stoppedHubId?: string) => {
        void AsyncStorage.getItem("bawatpieza_hub_id")
          .then((hubId) => {
            if (!hubId || (stoppedHubId && stoppedHubId !== hubId)) return;
            cancelScheduledAllocation();
            setSystemAllocated(false);
            setForceStopAvailable(false);
            setRequiresNewPlan(true);
            setRuntimeHoursByChannel({});
            setAllocs({});
            setPendingAllocationSummary(null);
            setAllocationProgress(null);
            allocationConfirmationPendingRef.current = false;
            setAllocationStatus(
              "Allocation stopped. A new plan is required before starting again.",
            );
            setRecoveryNoticeAcknowledged(false);
            if (allocationStarted) {
              setRecoveryModalReason("stopped");
              setRecoveryModalVisible(true);
            }
            allocationEndNotificationSentRef.current = true;
          })
          .catch((error: unknown) => {
            console.error(
              "[power-management] Could not apply the allocation stop event:",
              error,
            );
          });
      },
    );
    return () => {
      requestSubscription.remove();
      subscription.remove();
    };
  }, [allocationStarted, cancelScheduledAllocation]);

  useEffect(() => {
    let active = true;
    const subscription = DeviceEventEmitter.addListener(
      SYSTEM_ALLOCATION_PLAN_CALCULATED,
      (calculatedHubId?: string) => {
        void AsyncStorage.getItem("bawatpieza_hub_id")
          .then((hubId) => {
            if (
              !active ||
              !hubId ||
              (calculatedHubId && calculatedHubId !== hubId)
            ) {
              return;
            }
            setRequiresNewPlan(false);
            setRecoveryNoticeAcknowledged(true);
            setRecoveryModalVisible(false);
            setAllocationStatus((status) =>
              status ===
              "Allocation stopped. A new plan is required before starting again."
                ? ""
                : status,
            );
          })
          .catch((error: unknown) => {
            console.error(
              "[power-management] Could not sync the newly calculated plan:",
              error,
            );
          });
      },
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const cancelFutureAllocationStarts = () => {
    scheduledAllocationGroupsRef.current = [];
    if (allocationTimerRef.current) {
      clearTimeout(allocationTimerRef.current);
      allocationTimerRef.current = null;
    }
  };

  const notifyAllocationEnded = (
    reason: "runtime_complete" | "force_stop",
  ) => {
    if (allocationEndNotificationSentRef.current) return;
    allocationEndNotificationSentRef.current = true;
    const eventId = `${allocationRunIdRef.current}-${Date.now()}`;
    void AsyncStorage.getItem("bawatpieza_hub_id")
      .then((hubId) => {
        if (!hubId) throw new Error("Paired hub is unavailable for the allocation notification.");
        return notifySystemAllocationEnded(hubId, eventId, reason);
      })
      .catch((error: unknown) => {
        console.error("[power-management] Allocation end notification failed:", error);
      });
  };

  const clearDashboardAllocationStatus = () => {
    void AsyncStorage.getItem("bawatpieza_hub_id")
      .then((hubId) =>
        hubId ? clearSystemAllocationStatus(hubId) : undefined,
      )
      .catch((error: unknown) => {
        console.error(
          "[power-management] Could not clear dashboard allocation status:",
          error,
        );
      });
  };

  useEffect(() => {
    const scheduledRelayStopTimers = scheduledRelayStopTimersRef.current;
    return () => {
      const allocationStillRunning =
        scheduledAllocationGroupsRef.current.length > 0 ||
        scheduledRelayStopTimers.size > 0 ||
        pendingAutomaticStopsRef.current > 0 ||
        allocationCommandInFlightRef.current !== null;
      if (!allocationStillRunning) {
        cancelScheduledAllocation();
        if (allocationClientRef.current?.isConnected()) {
          allocationClientRef.current.disconnect();
        }
      }
    };
  }, [cancelScheduledAllocation]);

  useEffect(() => {
    let active = true;
    let loggedHardwareSettingsFailure = false;
    const refreshHardwareTestSettings = async () => {
      try {
        const settings = await fetchHardwareTestSettings();
        if (!active) return;
        if (
          hardwareTestSettingsUpdatedAtRef.current &&
          hardwareTestSettingsUpdatedAtRef.current !== settings.updated_at
        ) {
          cancelScheduledAllocation();
          setSystemAllocated(false);
          setAllocationProgress(null);
          setAllocationStatus(
            "Scheduled allocation cancelled because test settings changed.",
          );
        }
        hardwareTestSettingsUpdatedAtRef.current = settings.updated_at;
        setHardwareTestSettings(settings);
        setHardwareTestSettingsError("");
        setHardwareTestSettingsLoaded(true);
        loggedHardwareSettingsFailure = false;
      } catch (error) {
        if (!active) return;
        if (!loggedHardwareSettingsFailure) {
          console.error(
            "[power-management] Hardware test settings load failed:",
            error,
          );
          loggedHardwareSettingsFailure = true;
        }
        cancelScheduledAllocation();
        setSystemAllocated(false);
        setAllocationProgress(null);
        setHardwareTestSettingsError(
          error instanceof Error
            ? error.message
            : "Could not verify hardware test settings.",
        );
        setHardwareTestSettingsLoaded(true);
      }
    };

    void refreshHardwareTestSettings();
    const settingsTimer = setInterval(
      () => void refreshHardwareTestSettings(),
      10_000,
    );
    return () => {
      active = false;
      clearInterval(settingsTimer);
    };
  }, [cancelScheduledAllocation]);

  useFocusEffect(
    useCallback(() => {
    if (!allocationStarted) return;
    let cancelled = false;

    const loadChannels = async () => {
      setLoadingChannels(true);
      setChannelError("");
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) {
          if (!cancelled) {
            setChannels([]);
            setAllocationSetupComplete(false);
            setSavedAllocationPlan(null);
            setRequiresNewPlan(false);
            setSystemAllocated(false);
            setForceStopAvailable(false);
          }
          return;
        }
        const savedStatus = await loadSystemAllocationStatus(hubId);
        if (!cancelled) {
          if (savedStatus) {
            const now = Date.now();
            const activeNow = savedStatus.rooms.some(
              (room) =>
                Date.parse(room.startAt) <= now &&
                Date.parse(room.endAt) > now,
            );
            const scheduledLater = savedStatus.rooms.some(
              (room) => Date.parse(room.startAt) > now,
            );
            setForceStopAvailable(true);
            setSystemAllocated(activeNow);
            setAllocationStatus(
              activeNow
                ? "A room allocation is active. Use Force Stop to stop it."
                : scheduledLater
                  ? "A room allocation is scheduled. Use Force Stop to cancel it."
                  : "A previous allocation status remains. Use Force Stop to ensure all room relays are off.",
            );
          } else {
            setSystemAllocated(false);
            setForceStopAvailable(false);
          }
        }
        const mustCalculateNewPlan =
          await systemAllocationRequiresNewPlan(hubId);
        if (!cancelled) {
          setRequiresNewPlan(mustCalculateNewPlan);
          if (mustCalculateNewPlan) {
            setRecoveryModalReason("stopped");
            setRecoveryNoticeAcknowledged(false);
            setRecoveryModalVisible(true);
          }
        }

        const { data, error } = await supabase
          .from("device_setups")
          .select("setup_payload")
          .eq("hub_id", hubId)
          .maybeSingle();
        if (error) {
          throw new Error(`Could not load configured channels: ${error.message}`);
        }

        const setupPayload: unknown = data?.setup_payload;
        const rawChannels = isRecord(setupPayload)
          ? setupPayload.channels
          : undefined;
        if (!Array.isArray(rawChannels)) {
          if (!cancelled) {
            setChannels([]);
            setAllocationSetupComplete(false);
            setSavedAllocationPlan(null);
          }
          return;
        }

        const configuredChannels: ConfiguredChannel[] = rawChannels.flatMap(
          (entry: unknown) => {
            if (typeof entry !== "object" || entry === null) return [];
            const channelData = entry as {
              allocation_priority?: unknown;
              channel?: unknown;
              priority_status?: unknown;
              rooms?: unknown;
              start_date?: unknown;
              start_time?: unknown;
              watts?: unknown;
            };
            if (
              typeof channelData.channel !== "number" ||
              !Number.isInteger(channelData.channel)
            ) {
              return [];
            }
            const rooms = Array.isArray(channelData.rooms)
              ? channelData.rooms
              : [];
            const firstRoom = rooms[0];
            const priority =
              channelData.allocation_priority ?? channelData.priority_status;
            const roomName =
              typeof firstRoom === "object" &&
              firstRoom !== null &&
              "name" in firstRoom &&
              typeof firstRoom.name === "string" &&
              firstRoom.name.trim()
                ? firstRoom.name.trim()
                : `Room Channel ${channelData.channel}`;

            return [
              {
                channel: channelData.channel,
                roomName,
                priority: isChannelPriority(priority)
                  ? priority
                  : "low",
                watts: readNumber(channelData.watts) ?? 0,
                startDate:
                  typeof channelData.start_date === "string"
                    ? channelData.start_date
                    : "",
                startTime:
                  typeof channelData.start_time === "string"
                    ? channelData.start_time
                    : "",
              },
            ];
          },
        );

        if (!cancelled) {
          setAllocationSetupComplete(
            hasCompleteAllocationSetup(setupPayload),
          );
          setChannels(configuredChannels);
          const settings = isRecord(setupPayload)
            ? setupPayload.allocation_settings
            : undefined;
          const lastCalculation =
            isRecord(settings) && isRecord(settings.last_calculation)
              ? settings.last_calculation
              : null;
          setSavedAllocationPlan(
            lastCalculation &&
              typeof lastCalculation.calculated_at === "string" &&
              Number.isFinite(Date.parse(lastCalculation.calculated_at)) &&
              isAllocationSummary(lastCalculation.summary)
              ? {
                  calculatedAt: lastCalculation.calculated_at,
                  summary: lastCalculation.summary,
                }
              : null,
          );
          setHighPriorityWeight(
            isRecord(settings)
              ? (readNumber(settings.high_priority_weight) ?? 0.7)
              : 0.7,
          );
          setInverterEfficiency(
            isRecord(settings)
              ? (readNumber(settings.inverter_efficiency) ?? 1)
              : 1,
          );
          setRuntimeHoursByChannel({});
          setActiveChannel((current) =>
            configuredChannels.some((channel) => channel.channel === current)
              ? current
              : (configuredChannels[0]?.channel ?? null),
          );
          setAllocs((current) =>
            Object.fromEntries(
              configuredChannels.map((channel) => [
                channel.channel,
                current[channel.channel] ?? 0,
              ]),
            ),
          );
        }
      } catch (error) {
        console.error("[power-management] Channel setup load failed:", error);
        if (!cancelled) {
          setChannels([]);
          setAllocationSetupComplete(false);
          setSavedAllocationPlan(null);
          setChannelError(
            error instanceof Error
              ? error.message
              : "Could not load configured channels.",
          );
        }
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    };

    void loadChannels();
    return () => {
      cancelled = true;
    };
    }, [allocationStarted]),
  );

  const allocationBatteryPct = hardwareTestSettings?.enabled
    ? hardwareTestSettings.battery_percentage
    : batteryPct;
  const hasBatteryReading = allocationBatteryPct !== null;
  const storedEnergyWh = hasBatteryReading
    ? (NOMINAL_BATTERY_WH * allocationBatteryPct) / 100
    : 0;
  const usableEnergyWh = hasBatteryReading
    ? Math.max(
        0,
        storedEnergyWh -
          (NOMINAL_BATTERY_WH * RESERVED_POOL_PERCENTAGE) / 100,
      ) * inverterEfficiency
    : 0;
  const savedPlanMatchesSetup =
    !requiresNewPlan &&
    savedAllocationPlan !== null &&
    savedAllocationPlan.summary.rooms.length === channels.length &&
    Math.abs(
      savedAllocationPlan.summary.budgets.highWeightPercent -
        highPriorityWeight * 100,
    ) < 0.1 &&
    Math.abs(
      savedAllocationPlan.summary.battery.inverterEfficiency -
        inverterEfficiency,
    ) < 0.0001 &&
    channels.every((channel) => {
      const room = savedAllocationPlan.summary.rooms.find(
        (entry) => entry.channel === channel.channel,
      );
      return (
        room !== undefined &&
        room.roomName === channel.roomName &&
        room.watts === channel.watts &&
        room.priority === channel.priority &&
        room.startDate === channel.startDate &&
        room.startTime === channel.startTime
      );
    });
  const savedRuntimeHoursByChannel = savedPlanMatchesSetup
    ? Object.fromEntries(
        savedAllocationPlan.summary.rooms.map((room) => [
          room.channel,
          room.runtimeHours,
        ]),
      )
    : {};
  const useSavedRuntimePlan =
    Object.keys(runtimeHoursByChannel).length === 0 &&
    savedPlanMatchesSetup;
  const displayedRuntimeHoursByChannel = useSavedRuntimePlan
    ? savedRuntimeHoursByChannel
    : runtimeHoursByChannel;
  const plannedRoomRuntimeHours = channels.reduce(
    (total, channel) =>
      total +
      Math.max(0, displayedRuntimeHoursByChannel[channel.channel] ?? 0),
    0,
  );
  const longestRoomRuntimeHours = channels.reduce(
    (longest, channel) =>
      Math.max(
        longest,
        displayedRuntimeHoursByChannel[channel.channel] ?? 0,
      ),
    0,
  );
  const usablePool = plannedRoomRuntimeHours;
  const totalPriorityWeight = channels.reduce(
    (total, channel) =>
      total + getChannelPriorityOption(channel.priority).percentage,
    0,
  );
  const channelShares = new Map(
    channels.map((channel) => {
      const priorityWeight = getChannelPriorityOption(
        channel.priority,
      ).percentage;
      const sharePercentage =
        totalPriorityWeight > 0
          ? (priorityWeight / totalPriorityWeight) * USABLE_POOL_PERCENTAGE
          : 0;
      return [
        channel.channel,
        {
          percentage: sharePercentage,
          hours:
            displayedRuntimeHoursByChannel[channel.channel] ??
            (usablePool * sharePercentage) / USABLE_POOL_PERCENTAGE,
        },
      ];
    }),
  );
  const effectiveAllocs = Object.fromEntries(
    channels.map((channel) => [
      channel.channel,
      Math.min(
        allocs[channel.channel] ?? 0,
        channelShares.get(channel.channel)?.hours ?? 0,
      ),
    ]),
  );

  const totalAssigned = Object.values(effectiveAllocs).reduce(
    (total, assigned) => total + assigned,
    0,
  );
  const remaining = Math.max(0, usablePool - totalAssigned);
  const runtimeSummary = channels
    .filter(
      (channel) =>
        displayedRuntimeHoursByChannel[channel.channel] !== undefined,
    )
    .map(
      (channel) =>
        `${channel.roomName} ${displayedRuntimeHoursByChannel[channel.channel].toFixed(1)}h`,
    )
    .join(" · ");
  const scheduledRoomSummary = channels
    .map(
      (channel) =>
        `${channel.roomName}: ${formatConfiguredSchedule(
          channel.startDate,
          channel.startTime,
        )}`,
    )
    .join(" · ");

  const setAssignedHours = (val: number) => {
    if (activeChannel === null) return;
    const channelShare = channelShares.get(activeChannel)?.hours ?? 0;
    const currentAssigned = effectiveAllocs[activeChannel] ?? 0;
    const maxAllowed = Math.min(channelShare, remaining + currentAssigned);
    setSystemAllocated(false);
    setAllocs((prev) => ({
      ...prev,
      [activeChannel]: Math.max(0, Math.min(val, maxAllowed)),
    }));
  };
  const sendAllocationCommands = async (
    channelsToPower: ConfiguredChannel[],
    calculatedRuntimeHours: Record<number, number>,
    runtimeBasisSocPercent: number,
    scheduledStart: Pick<ScheduledAllocationGroup, "at" | "applicationAt">,
    onRelayCommandPublished: (
      channel: ConfiguredChannel,
      shutoffAtMs: number,
    ) => void,
  ) => {
    assertPowerControlsAvailable();
    const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
    if (!hubId) throw new Error("Paired hub is unavailable.");
    if (channelsToPower.length === 0) {
      throw new Error(
        "Calculated room runtimes are below the hub's one-minute command precision.",
      );
    }

    const { data: authData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(`Could not verify the signed-in session: ${sessionError.message}`);
    }
    const token = authData.session?.access_token;
    if (!token) throw new Error("Your session expired. Please sign in again.");

    let runtimeHoursForRun = calculatedRuntimeHours;
    let socUsedForRun = runtimeBasisSocPercent;
    await new Promise<void>((resolve, reject) => {
      const client = new Paho.Client(
        "broker.hivemq.com",
        8884,
        `app-alloc-w-${Math.random().toString(16).substring(2, 8)}`,
      );
      allocationClientRef.current = client;
      let settled = false;
      let commandsSent = false;
      let batteryModeCommandSent = false;
      let batteryModeConfirmed = false;
      let latestBatterySoc: number | null = null;
      let hubTelemetryReceived = false;
      let startAllocationAfterTelemetrySubscription: (() => void) | null = null;
      let resolveBatteryModeWait: (() => void) | null = null;
      let rejectBatteryModeWait: ((error: Error) => void) | null = null;
      const confirmedChannels = new Set<number>();
      const telemetryTopic = `bawatpieza/devices/${hubId}/telemetry`;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        allocationClientRef.current = null;
        if (client.isConnected()) client.disconnect();
        if (error) {
          rejectBatteryModeWait?.(error);
          reject(error);
        } else {
          resolve();
        }
      };
      const maybeFinish = () => {
        if (
          batteryModeConfirmed &&
          commandsSent &&
          channelsToPower.every((channel) =>
            confirmedChannels.has(channel.channel),
          )
        ) {
          finish();
        }
      };
      const timeout = setTimeout(
        () =>
          finish(
            new Error(
              batteryModeConfirmed
                ? latestBatterySoc === null
                  ? "The hub confirmed battery mode but did not report its battery percentage. Room relays were not started."
                    : (hardwareTestSettings?.enabled
                        ? hardwareTestSettings.battery_percentage
                        : latestBatterySoc) <= RESERVED_POOL_PERCENTAGE
                      ? hardwareTestSettings?.enabled
                        ? "The simulated battery is at or below the 20% safe reserve. Room relays were not started."
                        : "The hub battery is at or below the 20% safe reserve. Room relays were not started."
                    : `The hub confirmed battery mode but did not confirm these rooms on: ${channelsToPower
                        .filter((channel) => !confirmedChannels.has(channel.channel))
                        .map((channel) => channel.roomName)
                        .join(", ")}.`
                : hubTelemetryReceived
                  ? "Timed out waiting for the hub to confirm battery mode. Room relays were not started."
                  : "No live telemetry arrived from the hub. Battery mode and room relays were not confirmed.",
            ),
          ),
        30_000,
      );

      client.onConnectionLost = () => {
        finish(new Error("Allocation connection was lost before powering bulbs."));
      };
      client.onMessageArrived = (message) => {
        if (message.destinationName !== telemetryTopic) return;
        try {
          const payload: unknown = JSON.parse(message.payloadString);
          if (!isRecord(payload)) return;
          hubTelemetryReceived = true;
          if (batteryModeCommandSent && payload.power_mode === "battery") {
            batteryModeConfirmed = true;
            const reportedSoc = readNumber(payload.bat_pct);
            if (reportedSoc !== null && reportedSoc >= 0 && reportedSoc <= 100) {
              latestBatterySoc = reportedSoc;
              resolveBatteryModeWait?.();
              resolveBatteryModeWait = null;
              rejectBatteryModeWait = null;
            }
            if (!commandsSent && latestBatterySoc !== null) {
              setAllocationStatus(
                `Battery mode confirmed. Turning on ${channelsToPower.map((channel) => channel.roomName).join(", ")}...`,
              );
            } else if (!commandsSent) {
              setAllocationStatus(
                "Battery mode confirmed. Waiting for the hub battery percentage...",
              );
            }
          }
          const beginAllocation = startAllocationAfterTelemetrySubscription;
          if (beginAllocation) {
            startAllocationAfterTelemetrySubscription = null;
            beginAllocation();
          }
          if (!commandsSent) return;
          channelsToPower.forEach((channel) => {
            if (payload[`ch${channel.channel}_on`] === true) {
              confirmedChannels.add(channel.channel);
            }
          });
          if (
            batteryModeConfirmed &&
            channelsToPower.every((channel) =>
              confirmedChannels.has(channel.channel),
            )
          ) {
            setAllocationStatus(
              `${channelsToPower.map((channel) => channel.roomName).join(", ")} bulb${channelsToPower.length === 1 ? " is" : "s are"} on in battery mode.`,
            );
            maybeFinish();
          }
        } catch (error) {
          console.warn(
            "[power-management] Ignoring invalid relay confirmation:",
            error,
          );
        }
      };
      client.connect({
        useSSL: true,
        keepAliveInterval: 20,
        onSuccess: () => {
          try {
            const beginAllocationAfterTelemetry = () => {
              void (async () => {
              assertPowerControlsAvailable();
              if (
                scheduledStart.at > Date.now() ||
                scheduledStart.applicationAt >
                  getApplicationDate(hardwareTestSettings, Date.now()).getTime()
              ) {
                throw new Error(
                  "The scheduled start time has not arrived. No hub command was sent.",
                );
              }
              setAllocationStatus("Sending battery-mode command to the hub...");
              batteryModeCommandSent = true;
              await sendHubCommand(hubId, token, {
                command: "force_battery",
              });
              if (!batteryModeConfirmed) {
                setAllocationStatus("Waiting for the hub to confirm battery mode...");
                await new Promise<void>((resolveBattery, rejectBattery) => {
                  resolveBatteryModeWait = resolveBattery;
                  rejectBatteryModeWait = rejectBattery;
                  if (batteryModeConfirmed) {
                    resolveBatteryModeWait = null;
                    rejectBatteryModeWait = null;
                    resolveBattery();
                  }
                });
              }
              assertPowerControlsAvailable();
              if (!batteryModeConfirmed) {
                throw new Error(
                  "The hub did not confirm battery mode. Room relays were not started.",
                );
              }
              if (latestBatterySoc === null) {
                throw new Error(
                  "The hub did not report a battery percentage. Room relays were not started.",
                );
              }
              const runtimeSocPercent = hardwareTestSettings?.enabled
                ? hardwareTestSettings.battery_percentage
                : latestBatterySoc;
              if (runtimeSocPercent <= RESERVED_POOL_PERCENTAGE) {
                throw new Error(
                  hardwareTestSettings?.enabled
                    ? "The simulated battery is at or below the 20% safe reserve. Room relays were not started."
                    : "Battery is at or below the 20% safe reserve. Room relays were not started.",
                );
              }
              if (Math.abs(runtimeSocPercent - runtimeBasisSocPercent) >= 0.1) {
                setAllocationStatus(
                  `${hardwareTestSettings?.enabled ? "Simulated" : "Live"} battery charge changed to ${runtimeSocPercent.toFixed(1)}%. Recalculating runtimes before turning on the bulbs...`,
                );
                const refreshClockNow = getApplicationDate(
                  hardwareTestSettings,
                  Date.now(),
                );
                const refreshScheduleDate = new Date(refreshClockNow);
                refreshScheduleDate.setDate(refreshScheduleDate.getDate() + 1);
                const refreshStartDate = [
                  refreshScheduleDate.getFullYear(),
                  String(refreshScheduleDate.getMonth() + 1).padStart(2, "0"),
                  String(refreshScheduleDate.getDate()).padStart(2, "0"),
                ].join("-");
                const refreshedSummary = await requestSystemAllocation({
                  hubId,
                  rooms: channels.map((channel) => ({
                    channel: channel.channel,
                    roomName: channel.roomName,
                    watts: channel.watts,
                    priority: channel.priority,
                    startDate: refreshStartDate,
                    startTime: channel.startTime,
                  })),
                  initialSocPercent: runtimeSocPercent,
                  highPriorityWeight,
                  inverterEfficiency,
                  now: refreshClockNow.toISOString(),
                  timeZone:
                    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                });
                const refreshedRuntimeHours: Record<number, number> = {};
                for (const room of refreshedSummary.rooms) {
                  refreshedRuntimeHours[room.channel] = room.runtimeHours;
                }
                if (
                  refreshedSummary.rooms.length !== channels.length ||
                  channels.some(
                    (channel) =>
                      !Number.isFinite(
                        refreshedRuntimeHours[channel.channel],
                      ) ||
                      refreshedRuntimeHours[channel.channel] < 0,
                  )
                ) {
                  throw new Error(
                    "The refreshed runtime plan did not include a valid runtime for every room.",
                  );
                }
                runtimeHoursForRun = refreshedRuntimeHours;
                setRuntimeHoursByChannel(refreshedRuntimeHours);
                setAllocs(refreshedRuntimeHours);
              }
              socUsedForRun = runtimeSocPercent;
              await Promise.all(
                channelsToPower.map((channel) => {
                  const share = channelShares.get(channel.channel);
                  const durationMinutes = Math.floor(
                    runtimeHoursForRun[channel.channel] * 60,
                  );
                  if (durationMinutes < 1) {
                    throw new Error(
                      `${channel.roomName} runtime is below the hub's one-minute command precision.`,
                    );
                  }
                  const shutoffAtMs =
                    Date.now() + durationMinutes * 60_000;
                  return sendHubCommand(hubId, token, {
                    command: "room_relay",
                    channel: channel.channel,
                    state: true,
                    allocation_pct: Number((share?.percentage ?? 0).toFixed(1)),
                    duration_minutes: durationMinutes,
                  }).then(() => {
                    onRelayCommandPublished(channel, shutoffAtMs);
                  });
                }),
              );
              commandsSent = true;
              maybeFinish();
              })().catch((error: unknown) => {
                finish(
                  error instanceof Error
                    ? error
                    : new Error("Could not send allocation commands to the hub."),
                );
              });
            };
            startAllocationAfterTelemetrySubscription =
              beginAllocationAfterTelemetry;
            setAllocationStatus(
              "Waiting for live hub telemetry before switching to battery mode...",
            );
            client.subscribe(telemetryTopic);
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("Could not send allocation commands."),
            );
          }
        },
        onFailure: () =>
          finish(new Error("Could not connect to the hub for allocation.")),
      });
    });
    return { runtimeHours: runtimeHoursForRun, soc: socUsedForRun };
  };
  const sendAllocationStopCommands = async (
    channelsToStop: ConfiguredChannel[] = channels,
    automatic = false,
  ) => {
    const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
    if (!hubId) throw new Error("Paired hub is unavailable.");
    if (channelsToStop.length === 0) {
      throw new Error("No configured room channels are available to stop.");
    }
    await sendSystemAllocationStopCommands(
      hubId,
      channelsToStop,
      () =>
        setAllocationStatus(
          automatic
            ? `Runtime ended for ${channelsToStop
                .map((channel) => channel.roomName)
                .join(", ")}. Waiting for the hub to confirm the relay is off...`
            : "Force-stop commands sent. Waiting for the hub to confirm each room is off...",
        ),
    );
  };
  const scheduleAutomaticShutoff = (
    channel: ConfiguredChannel,
    shutoffAtMs: number,
    runId: number,
  ) => {
    const existingTimer = scheduledRelayStopTimersRef.current.get(
      channel.channel,
    );
    if (existingTimer) clearTimeout(existingTimer);

    const scheduleTimer = () => {
      let timer: ReturnType<typeof setTimeout>;
      const delay = Math.max(0, shutoffAtMs - Date.now());
      timer = setTimeout(() => {
        if (
          scheduledRelayStopTimersRef.current.get(channel.channel) !== timer
        ) {
          return;
        }
        if (runId !== allocationRunIdRef.current) {
          scheduledRelayStopTimersRef.current.delete(channel.channel);
          return;
        }
        if (shutoffAtMs > Date.now()) {
          scheduleTimer();
          return;
        }

        scheduledRelayStopTimersRef.current.delete(channel.channel);
        pendingAutomaticStopsRef.current += 1;
        let stopConfirmed = false;
        setAllocationStatus(
          `${channel.roomName}'s calculated runtime ended. Sending a relay-off command...`,
        );
        const stopPromise = sendAllocationStopCommands([channel], true);
        allocationCommandInFlightRef.current = stopPromise;
        void stopPromise
          .then(() => {
            stopConfirmed = true;
          })
          .catch((error: unknown) => {
            console.error(
              `[power-management] Automatic shutoff failed for ${channel.roomName}:`,
              error,
            );
            if (runId !== allocationRunIdRef.current) return;
            setSystemAllocated(true);
            setForceStopAvailable(true);
            setAllocationStatus(
              `Automatic shutoff failed for ${channel.roomName}: ${
                error instanceof Error
                  ? error.message
                  : "the hub did not confirm the relay was off"
              } Use Force Stop to turn it off.`,
            );
          })
          .finally(() => {
            pendingAutomaticStopsRef.current = Math.max(
              0,
              pendingAutomaticStopsRef.current - 1,
            );
            if (allocationCommandInFlightRef.current === stopPromise) {
              allocationCommandInFlightRef.current = null;
            }
            if (
              stopConfirmed &&
              runId === allocationRunIdRef.current &&
              scheduledAllocationGroupsRef.current.length === 0 &&
              scheduledRelayStopTimersRef.current.size === 0 &&
              pendingAutomaticStopsRef.current === 0
            ) {
              setSystemAllocated(false);
              setForceStopAvailable(false);
              clearDashboardAllocationStatus();
              setAllocationProgress({
                label: "Allocation complete. All room relays are confirmed off.",
                percent: 100,
              });
              setAllocationStatus(
                `${channel.roomName}'s runtime ended and the hub confirmed its relay is off. Allocation complete.`,
              );
              notifyAllocationEnded("runtime_complete");
            } else if (stopConfirmed && runId === allocationRunIdRef.current) {
              setAllocationStatus(
                `${channel.roomName}'s runtime ended and the hub confirmed its relay is off.`,
              );
            }
          });
      }, Math.min(delay, MAX_TIMEOUT_MS));
      scheduledRelayStopTimersRef.current.set(channel.channel, timer);
    };

    scheduleTimer();
  };
  const stopSystemAllocation = async () => {
    cancelScheduledAllocation();
    setAllocationProgress(null);
    setStoppingAllocation(true);
    setAllocationStatus("Sending stop commands to the hub...");
    try {
      await allocationCommandInFlightRef.current?.catch(() => undefined);
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      if (!hubId) throw new Error("Paired hub is unavailable.");
      const stopTargets = Array.isArray(channels)
        ? channels.flatMap((entry: unknown) => {
            if (!isRecord(entry)) return [];
            const channel = readNumber(entry.channel);
            if (
              channel === null ||
              !Number.isInteger(channel) ||
              typeof entry.roomName !== "string" ||
              !entry.roomName.trim()
            ) {
              return [];
            }
            return [{ channel, roomName: entry.roomName.trim() }];
          })
        : [];
      if (stopTargets.length === 0 || stopTargets.length !== channels.length) {
        setRecoveryModalReason("setup_required");
        setRecoveryModalVisible(true);
        throw new Error(
          "Room setup is incomplete. Return to System Allocation setup before stopping or starting an allocation.",
        );
      }
      await forceStopSystemAllocation(
        hubId,
        stopTargets,
        () =>
          setAllocationStatus(
            "Force-stop commands sent. Waiting for the hub to confirm each room is off...",
          ),
      );
      setSystemAllocated(false);
      setForceStopAvailable(false);
      setAllocationProgress(null);
      setRuntimeHoursByChannel({});
      setAllocs({});
      setAllocationStatus(
        "Allocation stopped. A new plan is required before starting again.",
      );
      allocationEndNotificationSentRef.current = true;
    } catch (error) {
      console.error("[power-management] Allocation stop failed:", error);
      setAllocationStatus(
        error instanceof Error
          ? error.message
          : "Could not stop the room allocation.",
      );
    } finally {
      setStoppingAllocation(false);
    }
  };
  const startSystemAllocation = async (
    pendingSummary?: AllocationSummary,
  ) => {
    if (stoppingAllocation || allocationConfirmationPendingRef.current) return;
    if (
      systemAllocated ||
      scheduledAllocationGroupsRef.current.length > 0 ||
      scheduledRelayStopTimersRef.current.size > 0 ||
      pendingAutomaticStopsRef.current > 0
    ) {
      setAllocationStatus(
        "A room allocation is already active. Use Force Stop before starting another one.",
      );
      return;
    }
    if (requiresNewPlan) {
      setRecoveryModalReason("stopped");
      setRecoveryModalVisible(true);
      setAllocationStatus(
        "Calculate a fresh runtime plan in System Allocation before starting.",
      );
      return;
    }
    cancelScheduledAllocation();
    if (!hardwareTestSettingsLoaded || hardwareTestSettingsError) {
      setAllocationStatus(
        hardwareTestSettingsError ||
          "Waiting to verify hardware test settings.",
      );
      return;
    }
    if (!allocationSetupComplete || channels.length === 0) {
      setRecoveryModalReason("setup_required");
      setRecoveryModalVisible(true);
      setAllocationStatus("Complete System Allocation setup before continuing.");
      return;
    }
    if (telemetryConnection !== "live") {
      setAllocationStatus(
        "The hub is not reporting live telemetry. Reconnect the hub before starting the room allocation.",
      );
      return;
    }
    if (allocationBatteryPct === null) {
      setAllocationStatus("Waiting for a battery state-of-charge reading.");
      return;
    }
    setAllocationProgress({
      label: pendingSummary
        ? "Confirming battery mode before allocation..."
        : "Calculating runtime plan...",
      percent: pendingSummary ? 35 : 10,
    });
    const calculationRunId = allocationRunIdRef.current;
    let activeRunId = calculationRunId;
    setCalculatingRuntime(true);
    if (!pendingSummary) {
      setRuntimeHoursByChannel({});
      setAllocationStatus("Calculating room runtimes from the saved setup...");
    }
    try {
      const timeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const requestAllocation = async (initialSocPercent: number) => {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) throw new Error("Paired hub is unavailable.");
        return requestSystemAllocation({
          hubId,
          rooms: channels.map((channel) => ({
            channel: channel.channel,
            roomName: channel.roomName,
            watts: channel.watts,
            priority: channel.priority,
            startDate: channel.startDate,
            startTime: channel.startTime,
          })),
          initialSocPercent,
          highPriorityWeight,
          inverterEfficiency,
          now: getApplicationDate(
            hardwareTestSettings,
            Date.now(),
          ).toISOString(),
          timeZone,
        });
      };
      const getRuntimeHours = (allocationSummary: AllocationSummary) => {
        if (
          !allocationSummary ||
          !Array.isArray(allocationSummary.rooms) ||
          allocationSummary.rooms.length === 0
        ) {
          throw new Error(
            "The runtime plan is incomplete. Return to System Allocation setup and calculate a new plan.",
          );
        }
        const runtimes: Record<number, number> = {};
        for (const room of allocationSummary.rooms) {
          runtimes[room.channel] = room.runtimeHours;
        }
        if (
          allocationSummary.rooms.length !== channels.length ||
          channels.some((channel) => {
            const result = allocationSummary.rooms.find(
              (room) => room.channel === channel.channel,
            );
            return (
              !Number.isFinite(runtimes[channel.channel]) ||
              runtimes[channel.channel] < 0 ||
              !result ||
              result.roomName !== channel.roomName ||
              result.priority !== channel.priority ||
              result.startDate !== channel.startDate ||
              result.startTime !== channel.startTime ||
              !Number.isFinite(Date.parse(result.startAt))
            );
          })
        ) {
          throw new Error(
            "The runtime plan did not include a valid runtime and start time for every configured room.",
          );
        }
        return runtimes;
      };
      const savedPlanAgeMs = savedAllocationPlan
        ? Date.now() - Date.parse(savedAllocationPlan.calculatedAt)
        : Number.POSITIVE_INFINITY;
      const savedSummaryMatchesSetup =
        savedAllocationPlan !== null &&
        savedPlanAgeMs >= 0 &&
        savedPlanAgeMs <= 15 * 60 * 1000 &&
        Math.abs(
          savedAllocationPlan.summary.battery.initialSocPercent -
            allocationBatteryPct,
        ) < 0.1 &&
        Math.abs(
          savedAllocationPlan.summary.budgets.highWeightPercent -
            highPriorityWeight * 100,
        ) < 0.1 &&
        Math.abs(
          savedAllocationPlan.summary.battery.inverterEfficiency -
            inverterEfficiency,
        ) < 0.0001 &&
        savedAllocationPlan.summary.rooms.length === channels.length &&
        channels.every((channel) => {
          const room = savedAllocationPlan.summary.rooms.find(
            (entry) => entry.channel === channel.channel,
          );
          return (
            room !== undefined &&
            room.roomName === channel.roomName &&
            room.watts === channel.watts &&
            room.priority === channel.priority &&
            room.startDate === channel.startDate &&
            room.startTime === channel.startTime
          );
        });
      const reusableSavedSummary = savedSummaryMatchesSetup
        ? savedAllocationPlan?.summary
        : null;
      let summary =
        pendingSummary ??
        (reusableSavedSummary
          ? reusableSavedSummary
          : await requestAllocation(allocationBatteryPct));
      let calculatedRuntimeHours = getRuntimeHours(summary);

      if (calculationRunId !== allocationRunIdRef.current) return;
      if (!pendingSummary) {
        setRuntimeHoursByChannel(calculatedRuntimeHours);
        setAllocs(calculatedRuntimeHours);
        allocationConfirmationPendingRef.current = true;
        setPendingAllocationSummary(summary);
        setAllocationProgress({
          label: "Runtime plan ready. Confirm the saved schedule to continue.",
          percent: 25,
        });
        setAllocationStatus("Confirm the saved schedule to arm allocation.");
        return;
      }

      setAllocationProgress({
        label: "Arming the scheduled allocation...",
        percent: 40,
      });
      setAllocationStatus(
        "Schedule confirmed. The hub and bulbs will stay unchanged until each room's scheduled start time.",
      );
      let runtimeBasisSocPercent = summary.battery.initialSocPercent;
      setAllocationProgress({
        label: "Preparing scheduled room start times...",
        percent: 55,
      });
      setRuntimeHoursByChannel(calculatedRuntimeHours);
      setAllocs(calculatedRuntimeHours);
      const groupsByStart = new Map<
        number,
        { applicationAt: number; channels: ConfiguredChannel[] }
      >();
      const scheduledAtByChannel = new Map<number, number>();
      const scheduleClockNowMs = Date.now();
      const applicationClockNowMs = getApplicationDate(
        hardwareTestSettings,
        scheduleClockNowMs,
      ).getTime();
      for (const room of summary.rooms) {
        if (Math.floor(room.runtimeHours * 60) < 1) continue;
        const configuredChannel = channels.find(
          (channel) => channel.channel === room.channel,
        );
        if (!configuredChannel) continue;
        const plannedStartAtMs = Date.parse(room.startAt);
        if (
          !matchesConfiguredSchedule(
            plannedStartAtMs,
            configuredChannel,
            timeZone,
          )
        ) {
          throw new Error(
            `The runtime plan did not include the configured start date and time for ${room.roomName}.`,
          );
        }
        const startAt =
          scheduleClockNowMs + plannedStartAtMs - applicationClockNowMs;
        if (
          !Number.isFinite(plannedStartAtMs) ||
          !Number.isFinite(startAt) ||
          startAt <= scheduleClockNowMs
        ) {
          const plannedStartLabel = Number.isFinite(plannedStartAtMs)
            ? new Date(plannedStartAtMs).toLocaleString()
            : room.startAt;
          throw new Error(
            `Scheduled start ${plannedStartLabel} must be in the future.`,
          );
        }
        const group = groupsByStart.get(startAt) ?? {
          applicationAt: plannedStartAtMs,
          channels: [],
        };
        group.channels.push(configuredChannel);
        groupsByStart.set(startAt, group);
        scheduledAtByChannel.set(room.channel, startAt);
      }
      const runtimeDescription = summary.rooms
        .map((room) => {
          const scheduledAt = scheduledAtByChannel.get(room.channel);
          const startAt = scheduledAt ?? Date.parse(room.startAt);
          return `${room.roomName}: ${room.runtimeHHMM}, starts ${new Date(startAt).toLocaleString()}`;
        })
        .join(" · ");
      const scheduledGroups: ScheduledAllocationGroup[] = [
        ...groupsByStart.entries(),
      ]
        .map(([at, group]) => ({
          at,
          applicationAt: group.applicationAt,
          channels: group.channels,
        }))
        .sort((first, second) => first.at - second.at);
      if (scheduledGroups.length === 0) {
        throw new Error(
          "Calculated room runtimes are below the hub's one-minute command precision.",
        );
      }
      const totalScheduledRooms = scheduledGroups.reduce(
        (total, group) => total + group.channels.length,
        0,
      );
      let startedScheduledRooms = 0;

      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      if (!hubId) throw new Error("Paired hub is unavailable.");
      const statusRooms = summary.rooms
        .filter((room) => Math.floor(room.runtimeHours * 60) >= 1)
        .map((room) => {
          const startAt = scheduledAtByChannel.get(room.channel);
          if (startAt === undefined) {
            throw new Error(
              `Could not resolve the scheduled start for ${room.roomName}.`,
            );
          }
          return {
            channel: room.channel,
            roomName: room.roomName,
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(
              startAt + room.runtimeHours * 60 * 60 * 1000,
            ).toISOString(),
          };
        });
      await saveSystemAllocationStatus(hubId, statusRooms);
      setForceStopAvailable(true);
      if (calculationRunId !== allocationRunIdRef.current) {
        await clearSystemAllocationStatus(hubId);
        setForceStopAvailable(false);
        return;
      }
      scheduledAllocationGroupsRef.current = scheduledGroups;
      const scheduledRunId = ++allocationRunIdRef.current;
      allocationEndNotificationSentRef.current = false;
      activeRunId = scheduledRunId;
      const scheduleNextGroup = () => {
        if (scheduledRunId !== allocationRunIdRef.current) return;
        const nextGroup = scheduledAllocationGroupsRef.current[0];
        if (!nextGroup) {
          setAllocationProgress({
            label: "All scheduled rooms are on. Automatic shutoff is active.",
            percent: 100,
          });
          setAllocationStatus(
            "All scheduled rooms have started. Each room will be turned off at the end of its calculated runtime.",
          );
          return;
        }
        const now = Date.now();
        const applicationNow = getApplicationDate(
          hardwareTestSettings,
          now,
        ).getTime();
        const delay = Math.max(
          0,
          nextGroup.at - now,
          nextGroup.applicationAt - applicationNow,
        );
        const roomNames = nextGroup.channels
          .map((channel) => channel.roomName)
          .join(", ");
        const progressPercent = Math.min(
          95,
          55 +
            Math.round(
              (startedScheduledRooms / totalScheduledRooms) * 40,
            ),
        );
        setAllocationProgress({
          label:
            delay > 0
              ? `Waiting for ${roomNames} to start at ${new Date(nextGroup.at).toLocaleString()}...`
              : `Starting ${roomNames}...`,
          percent: progressPercent,
        });
        allocationTimerRef.current = setTimeout(() => {
          allocationTimerRef.current = null;
          if (scheduledRunId !== allocationRunIdRef.current) return;
          if (
            nextGroup.at > Date.now() ||
            nextGroup.applicationAt >
              getApplicationDate(hardwareTestSettings, Date.now()).getTime()
          ) {
            scheduleNextGroup();
            return;
          }
          scheduledAllocationGroupsRef.current.shift();
          setSystemAllocated(true);
          setAllocationStatus(
            `Preparing ${roomNames}: switching to battery mode before turning on the bulbs...`,
          );
          setAllocationProgress({
            label: `Starting ${roomNames}; waiting for hub confirmation...`,
            percent: Math.min(98, progressPercent + 3),
          });
          const commandPromise = sendAllocationCommands(
            nextGroup.channels,
            calculatedRuntimeHours,
            runtimeBasisSocPercent,
            nextGroup,
            (channel, shutoffAtMs) =>
              scheduleAutomaticShutoff(
                channel,
                shutoffAtMs,
                scheduledRunId,
              ),
          );
          allocationCommandInFlightRef.current = commandPromise;
          trackSystemAllocationCommand(commandPromise);
          void commandPromise
            .then((result) => {
              if (scheduledRunId !== allocationRunIdRef.current) return;
              calculatedRuntimeHours = result.runtimeHours;
              runtimeBasisSocPercent = result.soc;
              startedScheduledRooms += nextGroup.channels.length;
              scheduleNextGroup();
            })
            .catch((error: unknown) => {
              if (scheduledRunId !== allocationRunIdRef.current) return;
              setAllocationProgress(null);
              console.error(
                "[power-management] Allocation command failed:",
                error,
              );
              cancelFutureAllocationStarts();
              setSystemAllocated(false);
              if (
                scheduledRelayStopTimersRef.current.size === 0 &&
                pendingAutomaticStopsRef.current === 0
              ) {
                clearDashboardAllocationStatus();
              }
              setAllocationProgress(null);
              setAllocationStatus(
                error instanceof Error
                  ? `${error.message} Any room whose ON command was accepted still has an automatic shutoff scheduled.`
                  : "Could not power the channel bulbs.",
              );
            })
            .finally(() => {
              if (allocationCommandInFlightRef.current === commandPromise) {
                allocationCommandInFlightRef.current = null;
              }
            });
        }, Math.min(delay, MAX_TIMEOUT_MS));
      };
      setForceStopAvailable(true);
      setAllocationStatus(`Room allocations scheduled: ${runtimeDescription}.`);
      scheduleNextGroup();
    } catch (error) {
      if (calculationRunId !== allocationRunIdRef.current) return;
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Could not calculate the room runtime plan.";
      if (/Scheduled start .+ must be in the future\./i.test(errorMessage)) {
        setAllocationProgress(null);
        setPastScheduleError(errorMessage);
        setAllocationStatus("");
        return;
      }
      if (
        /invalid system allocation summary|runtime plan (?:did not include|is incomplete)/i.test(
          errorMessage,
        )
      ) {
        setAllocationProgress(null);
        setSavedAllocationPlan(null);
        setPendingAllocationSummary(null);
        allocationConfirmationPendingRef.current = false;
        setAllocationStatus("");
        setAllocationErrorModal(errorMessage);
        return;
      }
      console.error("[power-management] Runtime calculation failed:", error);
      setAllocationStatus(
        errorMessage,
      );
    } finally {
      if (activeRunId === allocationRunIdRef.current) {
        setCalculatingRuntime(false);
      }
    }
  };
  useEffect(() => {
    startAllocationHandlerRef.current = startSystemAllocation;
  });
  useEffect(() => {
    if (
      !autoStartAfterSetupRef.current ||
      !allocationStarted ||
      loadingChannels ||
      !allocationSetupComplete ||
      !hasBatteryReading ||
      telemetryConnection !== "live" ||
      !hardwareTestSettingsLoaded ||
      hardwareTestSettingsError ||
      calculatingRuntime
    ) {
      return;
    }
    const startAllocation = startAllocationHandlerRef.current;
    if (!startAllocation) return;
    autoStartAfterSetupRef.current = false;
    void startAllocation();
  }, [
    allocationStarted,
    allocationSetupComplete,
    calculatingRuntime,
    hasBatteryReading,
    telemetryConnection,
    hardwareTestSettingsError,
    hardwareTestSettingsLoaded,
    loadingChannels,
  ]);
  const continueToAllocationSetup = () => {
    setRecoveryModalVisible(false);
    setRecoveryNoticeAcknowledged(true);
    setAllocationProgress(null);
    autoStartAfterSetupRef.current = false;
    allocationConfirmationPendingRef.current = false;
    setPendingAllocationSummary(null);
    cancelScheduledAllocation();
    setSystemAllocated(false);
    setForceStopAvailable(false);
    onAllocationStartedChange(false);
  };
  const recoveryModal = (
    <AllocationRecoveryModal
      visible={recoveryModalVisible}
      reason={recoveryModalReason}
      c={c}
      onContinue={continueToAllocationSetup}
    />
  );
  const selectedChannel =
    channels.find((channel) => channel.channel === activeChannel) ?? null;
  const selectedShare = selectedChannel
    ? channelShares.get(selectedChannel.channel)
    : undefined;
  const wantedHours = selectedShare?.hours ?? 0;
  const assignedHours =
    activeChannel === null ? 0 : (effectiveAllocs[activeChannel] ?? 0);

  if (!allocationStarted) {
    return (
      <>
        <SystemAllocationScreen
          embedded
          showRequiresNewPlanModal={!recoveryNoticeAcknowledged}
          onRequiresNewPlanAcknowledged={() =>
            setRecoveryNoticeAcknowledged(true)
          }
          onViewAllocation={() => {
            autoStartAfterSetupRef.current = false;
            onAllocationStartedChange(true);
          }}
          onStartAllocate={() => {
            autoStartAfterSetupRef.current = true;
            onAllocationStartedChange(true);
          }}
        />
        {recoveryModal}
      </>
    );
  }

  if (loadingChannels) {
    return (
      <>
        {recoveryModal}
        <View
          style={[
            styles.infoBand,
            { backgroundColor: c.surfaceMuted, borderColor: c.line },
          ]}
        >
          <Text style={[styles.cardCopy, { color: c.muted }]}>
            Checking System Allocation setup...
          </Text>
        </View>
      </>
    );
  }

  if (channelError) {
    return (
      <>
        {recoveryModal}
        <View
          style={[
            styles.infoBand,
            { backgroundColor: c.surfaceMuted, borderColor: c.danger },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: c.danger }]}>
            Could not verify System Allocation setup
          </Text>
          <Text style={[styles.cardCopy, { color: c.muted }]}>
            {channelError}
          </Text>
        </View>
      </>
    );
  }

  if (!loadingChannels && !channelError && !allocationSetupComplete) {
    return (
      <>
        {recoveryModal}
        <View
          style={[
            styles.infoBand,
            { backgroundColor: c.surfaceMuted, borderColor: c.line },
          ]}
        >
          <View style={styles.poolHeading}>
            <View style={[styles.poolIcon, { backgroundColor: c.accentSoft }]}>
              <Ionicons
                name="options-outline"
                size={scale(20)}
                color={c.accent}
              />
            </View>
            <Text style={[styles.noticeTitle, { color: c.text }]}>
              Set up System Allocation first
            </Text>
          </View>
          <Text style={[styles.cardCopy, { color: c.muted }]}>
            Before allocating battery power, measure each room&apos;s bulb,
            choose its HIGH or LOW priority, set start times, then calculate a
            fresh runtime plan before starting the allocation.
          </Text>
          <ActionButton
            label="Return to System Allocation Setup"
            onPress={() => {
              autoStartAfterSetupRef.current = false;
              cancelScheduledAllocation();
              setAllocationProgress(null);
              setSystemAllocated(false);
              clearDashboardAllocationStatus();
              onAllocationStartedChange(false);
            }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      {recoveryModal}
      <Modal
        visible={allocationErrorModal !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAllocationErrorModal(null)}
      >
        <View style={batteryConfirmStyles.overlay}>
          <View
            style={[
              batteryConfirmStyles.card,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
            accessibilityViewIsModal
          >
            <View style={batteryConfirmStyles.heading}>
              <View
                style={[
                  batteryConfirmStyles.icon,
                  { backgroundColor: c.danger + "22" },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={scale(22)}
                  color={c.danger}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.noticeTitle, { color: c.text }]}>
                  Runtime plan error
                </Text>
                <Text style={[styles.cardCopy, { color: c.muted }]}>
                  {allocationErrorModal}
                </Text>
              </View>
            </View>
            <View style={batteryConfirmStyles.actions}>
              <ActionButton
                label="Return to System Allocation Setup"
                onPress={() => {
                  setAllocationErrorModal(null);
                  continueToAllocationSetup();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={pastScheduleError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPastScheduleError(null)}
      >
        <View style={batteryConfirmStyles.overlay}>
          <View
            style={[
              batteryConfirmStyles.card,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <View style={batteryConfirmStyles.heading}>
              <View
                style={[
                  batteryConfirmStyles.icon,
                  { backgroundColor: c.orange + "22" },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={scale(22)}
                  color={c.orange}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.noticeTitle, { color: c.text }]}>
                  Scheduled start time has passed
                </Text>
                <Text style={[styles.cardCopy, { color: c.muted }]}>
                  The runtime plan cannot be calculated for a past start time.
                </Text>
              </View>
            </View>

            <View
              style={[
                batteryConfirmStyles.details,
                { backgroundColor: c.surfaceMuted },
              ]}
            >
              <Text style={[styles.cardCopy, { color: c.text }]}>
                {pastScheduleError}
              </Text>
              <Text style={[styles.cardCopy, { color: c.muted }]}>
                Change the room schedule to a future date and time, then
                calculate the runtime again before allocating. To start as soon
                as possible, choose a time at least one minute ahead.
              </Text>
            </View>

            <View style={batteryConfirmStyles.actions}>
              <ActionButton
                label="Change Schedule & Recalculate"
                onPress={() => {
                  autoStartAfterSetupRef.current = false;
                  setPastScheduleError(null);
                  cancelScheduledAllocation();
                  setSystemAllocated(false);
                  clearDashboardAllocationStatus();
                  onAllocationStartedChange(false);
                }}
              />
              <Pressable
                onPress={() => setPastScheduleError(null)}
                style={({ pressed }) => [
                  batteryConfirmStyles.cancelButton,
                  {
                    borderColor: c.line,
                    backgroundColor: pressed ? c.surfaceMuted : c.surface,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Dismiss past schedule message"
              >
                <Text style={[styles.smallBold, { color: c.text }]}>
                  Not Now
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingAllocationSummary !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          allocationConfirmationPendingRef.current = false;
          setPendingAllocationSummary(null);
          setAllocationProgress(null);
          setAllocationStatus(
            "Allocation cancelled. No room commands were sent.",
          );
        }}
      >
        <View style={batteryConfirmStyles.overlay}>
          <View
            style={[
              batteryConfirmStyles.card,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <View style={batteryConfirmStyles.heading}>
              <View
                style={[
                  batteryConfirmStyles.icon,
                  { backgroundColor: c.accentSoft },
                ]}
              >
                <Ionicons
                  name="battery-charging-outline"
                  size={scale(22)}
                  color={c.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.noticeTitle, { color: c.text }]}>
                  Confirm scheduled allocation?
                </Text>
                <Text style={[styles.cardCopy, { color: c.muted }]}>
                  Review each room&apos;s start time. The hub and bulbs will
                  remain unchanged until the scheduled time.
                </Text>
              </View>
            </View>

            {pendingAllocationSummary ? (
              <>
                <View
                  style={[
                    batteryConfirmStyles.details,
                    { backgroundColor: c.surfaceMuted },
                  ]}
                >
                  <Text style={[styles.cardCopy, { color: c.text }]}>
                    Runtime plan uses{" "}
                    {pendingAllocationSummary.battery.initialSocPercent.toFixed(
                      1,
                    )}
                    % battery.
                  </Text>
                  <Text style={[styles.cardCopy, { color: c.text }]}>
                    {hardwareTestSettings?.enabled
                      ? "Current simulated battery: "
                      : "Current live battery: "}
                    {allocationBatteryPct === null
                      ? "unavailable"
                      : `${allocationBatteryPct.toFixed(1)}%`}
                  </Text>
                  {hardwareTestSettings?.enabled ? (
                    <Text style={[styles.cardCopy, { color: c.text }]}>
                      Live hub reading:{" "}
                      {batteryPct === null
                        ? "unavailable"
                        : `${batteryPct.toFixed(1)}%`}
                    </Text>
                  ) : null}
                  {pendingAllocationSummary.rooms.map((room) => (
                    <Text
                      key={room.channel}
                      style={[styles.cardCopy, { color: c.text }]}
                    >
                      {room.roomName}:{" "}
                      {new Date(room.startAt).toLocaleString()}
                    </Text>
                  ))}
                  <Text style={[styles.cardCopy, { color: c.muted }]}>
                    At each start time, the hub will switch to battery, read
                    the current charge, recalculate if needed, then turn on
                    that room&apos;s bulb.
                  </Text>
                </View>

                <View style={batteryConfirmStyles.actions}>
                  <ActionButton
                    label="Confirm Scheduled Allocation"
                    onPress={() => {
                      const summary = pendingAllocationSummary;
                      if (!summary) return;
                      allocationConfirmationPendingRef.current = false;
                      setPendingAllocationSummary(null);
                      void startSystemAllocation(summary);
                    }}
                  />
                  <Pressable
                    onPress={() => {
                      allocationConfirmationPendingRef.current = false;
                      setPendingAllocationSummary(null);
                      setAllocationProgress(null);
                      autoStartAfterSetupRef.current = false;
                      cancelScheduledAllocation();
                      setSystemAllocated(false);
                      setForceStopAvailable(false);
                      onAllocationStartedChange(false);
                    }}
                    style={({ pressed }) => [
                      batteryConfirmStyles.cancelButton,
                      {
                        borderColor: c.accent,
                        backgroundColor: pressed ? c.surfaceMuted : c.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Change scheduled allocation date and time"
                  >
                    <Text style={[styles.smallBold, { color: c.accent }]}>
                      Change Date &amp; Time
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      allocationConfirmationPendingRef.current = false;
                      setPendingAllocationSummary(null);
                      setAllocationProgress(null);
                      setAllocationStatus(
                        "Allocation cancelled. No room commands were sent.",
                      );
                    }}
                    style={({ pressed }) => [
                      batteryConfirmStyles.cancelButton,
                      {
                        borderColor: c.line,
                        backgroundColor: pressed ? c.surfaceMuted : c.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel scheduled battery allocation"
                  >
                    <Text style={[styles.smallBold, { color: c.text }]}>
                      Cancel
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Pressable
        onPress={() => {
          autoStartAfterSetupRef.current = false;
          cancelScheduledAllocation();
          setAllocationProgress(null);
          setSystemAllocated(false);
          clearDashboardAllocationStatus();
          onAllocationStartedChange(false);
        }}
        style={({ pressed }) => [
          styles.infoBand,
          {
            backgroundColor: pressed ? c.surface : c.surfaceMuted,
            borderColor: c.line,
            marginBottom: scale(12),
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Go back to System Allocation setup"
      >
        <View style={styles.poolHeading}>
          <View style={[styles.poolIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="arrow-back-outline" size={scale(20)} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.noticeTitle, { color: c.text }]}>
              Back to System Allocation
            </Text>
            <Text style={[styles.cardCopy, { color: c.muted }]}>
              Update room wattage, priorities, and schedules
            </Text>
          </View>
          <Ionicons name="chevron-back" size={scale(18)} color={c.muted} />
        </View>
      </Pressable>

      {!hardwareTestSettingsLoaded ? (
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Preparing allocation settings...
        </Text>
      ) : hardwareTestSettingsError ? (
        <View
          style={[
            styles.infoBand,
            { backgroundColor: c.surfaceMuted, borderColor: c.danger },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: c.danger }]}>
            Allocation settings unavailable
          </Text>
          <Text style={[styles.cardCopy, { color: c.muted }]}>
            {hardwareTestSettingsError} Allocation is disabled until the test
            settings can be verified.
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.poolCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: scale(8),
          }}
        >
          <View
            style={{
              width: scale(118),
              height: scale(132),
              flexShrink: 0,
            }}
          >
            <AllocationBatteryIllustration
              batteryPercent={
                hasBatteryReading ? allocationBatteryPct : null
              }
              accentColor={c.accent}
              reserveColor={c.orange}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.poolHeading}>
              <Text style={[styles.poolTitle, { color: c.text, flex: 1 }]}>
                Battery & Reserve Overview
              </Text>
            </View>
            <Text
              style={[
                styles.poolSubtitle,
                { color: c.muted, marginTop: scale(4) },
              ]}
            >
              80% USABLE · 20% SAFE RESERVE
            </Text>
            <Text
              style={[
                styles.poolNote,
                { color: c.muted, marginTop: scale(7) },
              ]}
            >
              {hasBatteryReading
                ? `Battery is ${Math.floor(allocationBatteryPct ?? 0)}% full`
                : telemetryConnection === "offline"
                  ? "Battery telemetry is offline"
                  : "Fetching live battery availability..."}
            </Text>
            <Text style={[styles.poolNote, { color: c.muted }]}>
              {batteryV !== null
                ? `${batteryV.toFixed(1)}V live voltage`
                : "Voltage unavailable"}
            </Text>
            <Text style={[styles.poolNote, { color: c.muted }]}>
              {hasBatteryReading
                ? `${usableEnergyWh.toFixed(1)} Wh usable · ${(
                    (NOMINAL_BATTERY_WH * RESERVED_POOL_PERCENTAGE) /
                    100
                  ).toFixed(1)} Wh reserve`
                : "20% held as a safe reserve"}
            </Text>
          </View>
        </View>

      </View>

      <View
        style={[
          styles.poolCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: scale(12),
          }}
        >
          <View
            style={{
              width: scale(68),
              height: scale(68),
              flexShrink: 0,
            }}
          >
            <AllocationRuntimeClock
              accentColor={c.accent}
              faceColor={c.accentSoft}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.poolTitle, { color: c.text }]}>
              Runtime Overview
            </Text>
            <Text
              style={[
                styles.poolSubtitle,
                { color: c.muted, marginTop: scale(3) },
              ]}
            >
              MAXIMUM RUNTIME
            </Text>
            <Text
              style={[
                styles.poolValue,
                { color: c.text, textAlign: "left", marginTop: scale(2) },
              ]}
            >
              {runtimeSummary
                ? `~${longestRoomRuntimeHours.toFixed(1)}h`
                : "--h"}
            </Text>
            <Text style={[styles.poolNote, { color: c.muted }]}>
              {runtimeSummary
                ? `768 Wh nominal · ${runtimeSummary}`
                : "Runtime is calculated from battery level and measured bulb watts"}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.poolCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={styles.poolHeading}>
          <View style={[styles.poolIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons
              name="calendar-outline"
              size={scale(20)}
              color={c.accent}
            />
          </View>
          <Text style={[styles.poolTitle, { color: c.text }]}>
            Saved Room Schedule
          </Text>
        </View>
        <Text style={[styles.poolNote, { color: c.muted }]}>
          {scheduledRoomSummary || "No room schedule is available"}
        </Text>

        {!systemAllocated && !forceStopAvailable ? (
          <ActionButton
            label={
              calculatingRuntime
                ? "Calculating Runtime Plan..."
                : "Start Scheduled Allocation"
            }
            disabled={
              calculatingRuntime ||
              stoppingAllocation ||
              !hasBatteryReading ||
              !hardwareTestSettingsLoaded ||
              Boolean(hardwareTestSettingsError)
            }
            onPress={startSystemAllocation}
          />
        ) : null}

        {forceStopAvailable ? (
          <Pressable
            onPress={stopSystemAllocation}
            disabled={stoppingAllocation}
            style={({ pressed }) => [
              styles.actionButton,
              stoppingAllocation && styles.actionButtonDisabled,
              pressed && !stoppingAllocation ? { opacity: 0.82 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Force stop allocation and turn off configured room relays"
            accessibilityState={{ disabled: stoppingAllocation }}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: stoppingAllocation ? "#AAB1C2" : c.danger,
                },
              ]}
            />
            <Text style={styles.actionText}>
              {stoppingAllocation ? "Stopping Allocation..." : "Force Stop Allocation"}
            </Text>
          </Pressable>
        ) : null}

        <Text
          style={[styles.cardCopy, { color: c.muted, marginTop: scale(12) }]}
        >
          {allocationStatus
            ? allocationStatus
            : allocationProgress
              ? "Allocation is processing or waiting for the saved schedule."
            : systemAllocated
              ? "Scheduled allocation is active on the connected hub."
              : "Calculates each room's runtime from the saved System Allocation setup, then sends relay commands at the scheduled times."}
        </Text>
      </View>

      <View
        style={[
          styles.infoBand,
          { backgroundColor: c.surfaceMuted, borderColor: c.line },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: c.orange }]}>
          Campus-Wide Power Allocation
        </Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Room start dates and times come from System Allocation. Each room is
          powered for its newly calculated runtime at its scheduled time.
        </Text>
      </View>

      <SectionLabel label="ALL ZONES" c={c} />
      <Text style={[styles.cardCopy, { color: c.muted }]}>
        Each room&apos;s saved wattage, priority, and battery settings are used
        to calculate its runtime. The{" "}
        {RESERVED_POOL_PERCENTAGE}% safe reserve is preserved.
      </Text>

      {loadingChannels ? (
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Loading configured channels...
        </Text>
      ) : channelError ? (
        <Text style={[styles.cardCopy, { color: c.danger }]}>
          {channelError}
        </Text>
      ) : channels.length === 0 ? (
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          No configured channels found for this device.
        </Text>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.zoneRow}
          >
              {channels.map((item) => {
                const active = activeChannel === item.channel;
                const priority = getChannelPriorityOption(item.priority);
                return (
                  <Pressable
                    key={item.channel}
                    onPress={() => setActiveChannel(item.channel)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${item.roomName}, channel ${item.channel}, ${priority.label} priority, ${formatPercentage(channelShares.get(item.channel)?.percentage ?? 0)} percent allocation`}
                    style={[
                      styles.zonePill,
                      {
                        backgroundColor: active ? c.accent : c.surface,
                        borderColor: c.line,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.zoneText,
                        { color: active ? "#FFFFFF" : c.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.roomName}
                    </Text>
                    <Text
                      style={[
                        styles.zoneSubText,
                        { color: active ? "#FFFFFF" : c.muted },
                      ]}
                    >
                      Channel {item.channel}
                    </Text>
                    <Text
                      style={[
                        styles.zonePriorityText,
                        { color: active ? "#FFFFFF" : c.orange },
                      ]}
                    >
                      {priority.label} ·{" "}
                      {formatPercentage(
                        channelShares.get(item.channel)?.percentage ?? 0,
                      )}
                      % share
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

          {selectedChannel ? (
            <>
              <ZoneCard
                c={c}
                mode={mode}
                zone={selectedChannel.roomName}
                channel={selectedChannel.channel}
                startDate={selectedChannel.startDate}
                startTime={selectedChannel.startTime}
                priority={selectedChannel.priority}
                allocationPct={selectedShare?.percentage ?? 0}
                wantedHours={wantedHours}
                assignedHours={assignedHours}
                setAssignedHours={setAssignedHours}
                remainingPool={remaining}
              />
              <ActionButton
                label={
                  hardwareTestSettings?.enabled
                    ? "Use Zone Budget"
                    : "Confirm Allocation"
                }
                disabled={
                  !hasBatteryReading ||
                  !hardwareTestSettingsLoaded ||
                  Boolean(hardwareTestSettingsError)
                }
                onPress={() => {
                  setAllocationStatus(
                    "Zone budget selected. Start Scheduled Allocation to calculate runtimes and send the room schedule to the hub.",
                  );
                }}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
