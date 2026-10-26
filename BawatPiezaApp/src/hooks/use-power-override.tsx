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
};

const PowerOverrideContext = createContext<PowerOverrideContextValue | null>(
  null,
);

const STORAGE_KEY = "bawatpieza.power.override";
const HUB_STORAGE_KEY = "bawatpieza_hub_id";
const TELEMETRY_TOPIC_PREFIX = "bawatpieza/devices/";
const COMMAND_TOPIC_PREFIX = "bawatpieza/devices/";

function parse(raw: string | null): PowerOverride {
  if (raw === "grid" || raw === "battery" || raw === "shutdown") return raw;
  return null;
}

export function PowerOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<PowerOverride>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const mqttClientRef = useRef<Paho.Client | null>(null);
  const hubIdRef = useRef<string | null>(null);
  const overrideRef = useRef<PowerOverride>(null);
  const pendingOverrideRef = useRef<PowerOverride>(null);
  const userSelectedModeRef = useRef(false);
  const awaitingReportedModeRef = useRef<{
    mode: Exclude<PowerOverride, null>;
    expiresAt: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let activeHubId: string | null = null;
    let client: Paho.Client | null = null;
    let checkTimer: ReturnType<typeof setTimeout> | null = null;

    const sendOverride = (hubId: string, mode: PowerOverride) => {
      if (!mode || !client?.isConnected()) return false;
      const message = new Paho.Message(JSON.stringify({ command: `force_${mode}` }));
      message.destinationName = `${COMMAND_TOPIC_PREFIX}${hubId}/commands`;
      client.send(message);
      return true;
    };

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
          };
          const reportedMode = parse(
            typeof telemetry.power_mode === "string" ? telemetry.power_mode : null,
          );
          if (reportedMode) {
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
          if (pending && sendOverride(hubId, pending)) {
            pendingOverrideRef.current = null;
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

  const setOverride = useCallback(async (o: PowerOverride) => {
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

    try {
      const message = new Paho.Message(JSON.stringify({ command: `force_${o}` }));
      message.destinationName = `${COMMAND_TOPIC_PREFIX}${hubId}/commands`;
      client.send(message);
      pendingOverrideRef.current = null;
    } catch (error) {
      pendingOverrideRef.current = o;
      console.error("[power-override] failed to send mode to device", error);
    }
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
    }),
    [
      override,
      setOverride,
      clearOverride,
      overridesOpen,
      openOverrides,
      closeOverrides,
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
