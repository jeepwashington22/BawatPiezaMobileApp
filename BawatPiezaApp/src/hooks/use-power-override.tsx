import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Power source override chosen from Quick Overrides. `null` = Auto (no override). */
export type PowerOverride = 'grid' | 'battery' | 'shutdown' | null;

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

const PowerOverrideContext = createContext<PowerOverrideContextValue | null>(null);

const STORAGE_KEY = 'bawatpieza.power.override';

function parse(raw: string | null): PowerOverride {
  if (raw === 'grid' || raw === 'battery' || raw === 'shutdown') return raw;
  return null;
}

export function PowerOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<PowerOverride>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const parsed = parse(saved);
        if (parsed) setOverrideState(parsed);
      })
      .catch(() => {});
  }, []);

  const setOverride = useCallback((o: PowerOverride) => {
    setOverrideState(o);
    if (o) AsyncStorage.setItem(STORAGE_KEY, o).catch(() => {});
    else AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const clearOverride = useCallback(() => setOverride(null), [setOverride]);

  const openOverrides = useCallback(() => setOverridesOpen(true), []);
  const closeOverrides = useCallback(() => setOverridesOpen(false), []);

  const value = useMemo<PowerOverrideContextValue>(
    () => ({ override, setOverride, clearOverride, usingGrid: override === 'grid', overridesOpen, openOverrides, closeOverrides }),
    [override, setOverride, clearOverride, overridesOpen, openOverrides, closeOverrides],
  );

  return <PowerOverrideContext.Provider value={value}>{children}</PowerOverrideContext.Provider>;
}

export function usePowerOverride(): PowerOverrideContextValue {
  const ctx = useContext(PowerOverrideContext);
  if (!ctx) throw new Error('usePowerOverride must be used inside <PowerOverrideProvider>');
  return ctx;
}
