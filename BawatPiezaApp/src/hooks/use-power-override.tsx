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

function parse(raw: string | null): PowerOverride {
  if (raw === "grid" || raw === "battery" || raw === "shutdown") return raw;
  return null;
}

export function PowerOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<PowerOverride>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const mqttClientRef = useRef<Paho.Client | null>(null);

  // keep one persistent mqtt connection alive in the background
  useEffect(() => {
    let client: Paho.Client | null = null;

    const initMqtt = async () => {
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) return;

        const clientId = `app-bg-${Math.random().toString(16).substring(2, 8)}`;
        client = new Paho.Client("broker.hivemq.com", 8884, clientId);
        mqttClientRef.current = client;

        client.connect({
          useSSL: true,
          keepAliveInterval: 30,
          onSuccess: () =>
            console.log("background mqtt connected for instant overrides"),
        });
      } catch (err) {
        console.log("mqtt background init failed", err);
      }
    };

    initMqtt();

    return () => {
      if (client && client.isConnected()) {
        client.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const parsed = parse(saved);
        if (parsed) setOverrideState(parsed);
      })
      .catch(() => {});
  }, []);

  // update the state AND fire the hardware command instantly using the open connection
  const setOverride = useCallback(async (o: PowerOverride) => {
    setOverrideState(o);

    if (o) {
      AsyncStorage.setItem(STORAGE_KEY, o).catch(() => {});

      try {
        const client = mqttClientRef.current;
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");

        if (client && client.isConnected() && hubId) {
          const commandName = `force_${o}`;
          const payload = JSON.stringify({ command: commandName });
          const message = new Paho.Message(payload);
          message.destinationName = `bawatpieza/devices/${hubId}/commands`;
          client.send(message);
        }
      } catch (err) {
        console.log("failed to send override command", err);
      }
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
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
      usingGrid: override === "grid",
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
