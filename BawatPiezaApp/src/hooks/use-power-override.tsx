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

export type PowerOverride = "grid" | "battery" | "shutdown" | null;

type PowerOverrideContextValue = {
  override: PowerOverride;
  setOverride: (o: PowerOverride) => void;
  clearOverride: () => void;
  usingGrid: boolean;
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

  const ensureConnection = useCallback(async () => {
    const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
    if (!hubId) return null;

    if (mqttClientRef.current && mqttClientRef.current.isConnected()) {
      return mqttClientRef.current;
    }

    return new Promise<Paho.Client>((resolve) => {
      const clientId = `app-bg-${Math.random().toString(16).substring(2, 8)}`;
      const client = new Paho.Client("broker.hivemq.com", 8884, clientId);

      client.connect({
        useSSL: true,
        reconnect: true,
        keepAliveInterval: 30,
        onSuccess: () => {
          mqttClientRef.current = client;
          resolve(client);
        },
        onFailure: (err) => {
          console.log("mqtt connect failed", err);
          resolve(client);
        },
      });
    });
  }, []);

  useEffect(() => {
    ensureConnection();
  }, [ensureConnection]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const parsed = parse(saved);
        if (parsed) setOverrideState(parsed);
      })
      .catch(() => {});
  }, []);

  const setOverride = useCallback(
    async (o: PowerOverride) => {
      setOverrideState(o);

      if (o) {
        AsyncStorage.setItem(STORAGE_KEY, o).catch(() => {});

        try {
          const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
          if (!hubId) return;

          let payloadObj: any = { command: `force_${o}` };

          if (o === "grid") {
            payloadObj.grid_relay = true;
            payloadObj.battery_relay = true;
          } else if (o === "battery") {
            payloadObj.grid_relay = false;
            payloadObj.battery_relay = true;
          } else if (o === "shutdown") {
            payloadObj.grid_relay = false;
            payloadObj.battery_relay = false;
          }

          const payload = JSON.stringify(payloadObj);
          const message = new Paho.Message(payload);
          message.destinationName = `bawatpieza/devices/${hubId}/commands`;

          const client = await ensureConnection();
          if (client && client.isConnected()) {
            client.send(message);
          }
        } catch (err) {
          console.log("failed to send command", err);
        }
      } else {
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      }
    },
    [ensureConnection],
  );

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
      "usepoweroverride must be used inside <poweroverrideprovider>",
    );
  return ctx;
}
