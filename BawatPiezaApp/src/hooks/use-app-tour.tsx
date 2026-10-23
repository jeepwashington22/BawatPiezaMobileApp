import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScrollView, View } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';

/* ------------------------------ tour targets ------------------------------ */

/** The five elements the quick tour highlights. */
export type TourTargetId = 'battery' | 'live-stats' | 'zones' | 'heatmap' | 'nav';

export type TourStep = {
  id: TourTargetId;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * True for targets that live outside the scrollable content (the floating
   * bottom navigation). Those are never scrolled into view — they are already
   * pinned to the viewport.
   */
  fixed?: boolean;
};

/** Order matters — this is the order the spotlight walks through. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'live-stats',
    title: 'Live power readings',
    body: 'Voltage, power draw and footsteps update in real time, so you always know what your floor is pulling right now.',
    icon: 'speedometer-outline',
  },
  {
    id: 'battery',
    title: 'Battery health',
    body: 'See how much charge the hub has left. Tap the card to open Quick Overrides and force grid or battery.',
    icon: 'battery-charging-outline',
  },
  {
    id: 'zones',
    title: 'Your zones',
    body: 'Toggle a zone on or off, or open one to see its live readout, schedule and thresholds.',
    icon: 'layers-outline',
  },
  {
    id: 'heatmap',
    title: 'Footsteps become energy',
    body: 'Every step on a tile is converted into energy. The heatmap shows which tiles are walked on the most.',
    icon: 'footsteps-outline',
  },
  {
    id: 'nav',
    title: 'Move around fast',
    body: 'The bottom bar jumps to Power, Reports and Profile. The flash button in the middle opens Quick Overrides.',
    icon: 'compass-outline',
    fixed: true,
  },
];

/* -------------------------------- storage -------------------------------- */

/** "1" once the tour was finished (or skipped) — keeps it from auto-launching again. */
export const TOUR_COMPLETED_KEY = 'bawatpieza.tour.completed';
/** "1" once the welcome card was dismissed — stops the first-run prompt repeating. */
export const TOUR_WELCOME_KEY = 'bawatpieza.tour.welcomeSeen';

/* -------------------------------- context -------------------------------- */

export type TourStatus = 'idle' | 'welcome' | 'running';

type TargetRef = React.RefObject<View | null>;

export type TourContextValue = {
  /** 'idle' → nothing shown, 'welcome' → welcome card, 'running' → spotlight. */
  status: TourStatus;
  stepIndex: number;
  step: TourStep | null;
  totalSteps: number;
  /** True once the persisted "completed" flag has been read from storage. */
  checked: boolean;
  /** True when the tour was already finished in a previous session. */
  completed: boolean;
  /** True once the welcome card was dismissed in a previous session. */
  welcomeSeen: boolean;
  registerTarget: (id: TourTargetId, ref: TargetRef) => void;
  unregisterTarget: (id: TourTargetId) => void;
  getTargetRef: (id: TourTargetId) => TargetRef | null;
  /** Scroll container of the screen hosting the targets (the dashboard). */
  scrollContainerRef: React.MutableRefObject<ScrollView | null>;
  /** Records the vertical scroll offset of the hosting container (ref-based). */
  setScrollOffsetY: (y: number) => void;
  /** Reads the current scroll offset without triggering an app-wide re-render. */
  getScrollOffsetY: () => number;
  openWelcome: () => void;
  /** Dismiss the welcome card without starting the tour (persists the flag). */
  dismissWelcome: () => void;
  startTour: () => void;
  nextStep: () => void;
  skipTour: () => void;
  restartTour: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

/**
 * AppTourProvider — single source of truth for the five-step quick tour.
 *
 * - Persistence lives in AsyncStorage (`bawatpieza.tour.*`), so the tour only
 *   auto-launches the very first time it is seen and can be replayed forever
 *   from the profile screen.
 * - Targets register themselves through `TourSpot`; the overlay measures them
 *   in window coordinates to place the spotlight cut-out.
 */
export function AppTourProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TourStatus>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [welcomeSeen, setWelcomeSeen] = useState(false);

  const targets = useRef(new Map<TourTargetId, TargetRef>());
  const scrollContainerRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  /** Mirror of `stepIndex` so callbacks can read it without stale closures. */
  const stepIndexRef = useRef(0);

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  // Read the persisted flags once — the dashboard waits for this before it
  // decides whether to show the welcome card.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [completedValue, welcomeValue] = await Promise.all([
          AsyncStorage.getItem(TOUR_COMPLETED_KEY),
          AsyncStorage.getItem(TOUR_WELCOME_KEY),
        ]);
        if (!alive) return;
        setCompleted(completedValue === '1');
        setWelcomeSeen(welcomeValue === '1');
      } catch {
        if (!alive) return;
        setCompleted(false);
        setWelcomeSeen(false);
      } finally {
        if (alive) setChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const registerTarget = useCallback((id: TourTargetId, ref: TargetRef) => {
    targets.current.set(id, ref);
  }, []);

  const unregisterTarget = useCallback((id: TourTargetId) => {
    targets.current.delete(id);
  }, []);

  const getTargetRef = useCallback((id: TourTargetId) => targets.current.get(id) ?? null, []);

  /**
   * Scroll offset lives in a ref, not in state: it changes on every scroll
   * frame and putting it in context would re-render the whole app ~60x/second.
   */
  const setScrollOffsetY = useCallback((y: number) => {
    scrollOffsetRef.current = y;
  }, []);

  const getScrollOffsetY = useCallback(() => scrollOffsetRef.current, []);

  const openWelcome = useCallback(() => {
    setStepIndex(0);
    setStatus('welcome');
  }, []);

  const dismissWelcome = useCallback(() => {
    setWelcomeSeen(true);
    setStatus('idle');
    AsyncStorage.setItem(TOUR_WELCOME_KEY, '1').catch(() => {});
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setWelcomeSeen(true);
    setStatus('running');
    AsyncStorage.setItem(TOUR_WELCOME_KEY, '1').catch(() => {});
  }, []);

  const markCompleted = useCallback(() => {
    setCompleted(true);
    AsyncStorage.setItem(TOUR_COMPLETED_KEY, '1').catch(() => {});
  }, []);

  const nextStep = useCallback(() => {
    // Read the index outside the updater so the side effects (persisting the
    // completion flag, closing the tour) never run inside a state updater.
    const next = stepIndexRef.current + 1;
    if (next >= TOUR_STEPS.length) {
      markCompleted();
      setStatus('idle');
      setStepIndex(0);
      return;
    }
    setStepIndex(next);
  }, [markCompleted]);

  const skipTour = useCallback(() => {
    markCompleted();
    setStatus('idle');
  }, [markCompleted]);

  const restartTour = useCallback(() => {
    setStepIndex(0);
    setStatus('running');
  }, []);



  const value = useMemo<TourContextValue>(
    () => ({
      status,
      stepIndex,
      step: TOUR_STEPS[stepIndex] ?? null,
      totalSteps: TOUR_STEPS.length,
      checked,
      completed,
      welcomeSeen,
      registerTarget,
      unregisterTarget,
      getTargetRef,
      scrollContainerRef,
      setScrollOffsetY,
      getScrollOffsetY,
      openWelcome,
      dismissWelcome,
      startTour,
      nextStep,
      skipTour,
      restartTour,
    }),
    [
      status,
      stepIndex,
      checked,
      completed,
      welcomeSeen,
      registerTarget,
      unregisterTarget,
      getTargetRef,
      setScrollOffsetY,
      getScrollOffsetY,
      openWelcome,
      dismissWelcome,
      startTour,
      nextStep,
      skipTour,
      restartTour,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useAppTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useAppTour must be used inside <AppTourProvider>');
  return ctx;
}
