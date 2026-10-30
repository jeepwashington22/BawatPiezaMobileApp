import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type View as RNView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from './app-text';
import { useTheme } from '../theme';
import { useAppTour, type TourTargetId } from '../hooks/use-app-tour';

const ORANGE = '#F97316';
const RING = 10; // spotlight cut-out corner radius

type Rect = { x: number; y: number; width: number; height: number };
type MeasurableNode = RNView & {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  measure?: (
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ) => void;
  getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
};

/* ------------------------------- tour spot ------------------------------- */

/**
 * TourSpot — marks a view as a tour target so the overlay can measure it and
 * place the spotlight cut-out over it.
 *
 * Targets use a real native wrapper rather than cloning arbitrary components.
 * This makes refs measurable on native and web, including LinearGradient and
 * Pressable targets.
 */
export function TourSpot({
  id,
  children,
}: {
  id: TourTargetId;
  children: React.ReactElement;
}) {
  const { registerTarget, unregisterTarget } = useAppTour();
  const ref = useRef<RNView>(null);

  useEffect(() => {
    registerTarget(id, ref);
    return () => unregisterTarget(id);
  }, [id, registerTarget, unregisterTarget]);

  const handleLayout = useCallback((_event: LayoutChangeEvent) => {
    // The layout event keeps the wrapper mounted and measurable after animated
    // sections finish laying out. Actual window coordinates are read below.
  }, []);

  return (
    <View ref={ref} collapsable={false} onLayout={handleLayout} style={styles.targetWrapper}>
      {children}
    </View>
  );
}

/* ----------------------------- welcome screen ----------------------------- */

function TourWelcome({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const { colors: c } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise]);

  return (
    <View style={styles.modalRoot} pointerEvents="box-none">
      <Animated.View style={[styles.scrim, { opacity: fade }]} />
      <Animated.View
        style={[
          styles.welcomeCard,
          {
            opacity: fade,
            transform: [{ translateY: rise }],
            backgroundColor: c.surface,
            borderColor: c.line,
          },
        ]}
      >
        <View style={[styles.welcomeIcon, { backgroundColor: 'rgba(249,115,22,0.16)' }]}>
          <Ionicons name="sparkles" size={26} color={ORANGE} />
        </View>
        <Text style={[styles.welcomeTitle, { color: c.text }]}>Welcome to Bawat Pieza</Text>
        <Text style={[styles.welcomeBody, { color: c.muted }]}>
          Take a 30-second quick tour to learn where your battery, live readings, zones and
          foot-traffic heatmap live.
        </Text>

        <Pressable
          onPress={onStart}
          style={({ pressed }) => [styles.welcomeCta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Start the quick tour"
        >
          <Text style={styles.welcomeCtaText}>Start the tour</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.welcomeSkip, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
        >
          <Text style={[styles.welcomeSkipText, { color: c.muted }]}>Maybe later</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ---------------------------- spotlight overlay ---------------------------- */

/**
 * Builds an SVG path with a rounded hole punched out of it — the hole is the
 * spotlight, everything else is the dimmed scrim.
 */
function cutoutPath(width: number, height: number, r: Rect): string {
  const { x, y, width: w, height: h } = r;
  const radius = Math.min(RING, w / 2, h / 2);
  const outer = `M 0 0 H ${width} V ${height} H 0 Z`;
  const hole =
    `M ${x + radius} ${y} ` +
    `H ${x + w - radius} ` +
    `A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius} ` +
    `V ${y + h - radius} ` +
    `A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h} ` +
    `H ${x + radius} ` +
    `A ${radius} ${radius} 0 0 1 ${x} ${y + h - radius} ` +
    `V ${y + radius} ` +
    `A ${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
  return `${outer} ${hole}`;
}

function measureTarget(node: RNView, callback: (rect: Rect) => void): boolean {
  const measurable = node as MeasurableNode;
  if (typeof measurable.measureInWindow === 'function') {
    measurable.measureInWindow((x, y, width, height) => callback({ x, y, width, height }));
    return true;
  }
  if (typeof measurable.getBoundingClientRect === 'function') {
    const rect = measurable.getBoundingClientRect();
    callback({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    return true;
  }
  if (typeof measurable.measure === 'function') {
    measurable.measure((_x, _y, width, height, pageX, pageY) =>
      callback({ x: pageX, y: pageY, width, height }),
    );
    return true;
  }
  return false;
}

function Spotlight({ rect, children }: { rect: Rect; children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });
  const hasSize = rect.width > 0 && rect.height > 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hasSize && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={cutoutPath(width, height, rect)} fill="rgba(0,0,0,0.72)" fillRule="evenodd" />
        </Svg>
      )}

      {hasSize && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              left: rect.x - RING,
              top: rect.y - RING,
              width: rect.width + RING * 2,
              height: rect.height + RING * 2,
              borderRadius: RING + 8,
              borderColor: ORANGE,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      )}

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}


/* -------------------------------- tooltip --------------------------------- */

type TooltipProps = {
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  stepNumber: number;
  totalSteps: number;
  isLast: boolean;
  rect: Rect;
  onNext: () => void;
  onSkip: () => void;
};

function TourTooltip({
  title,
  body,
  icon,
  stepNumber,
  totalSteps,
  isLast,
  rect,
  onNext,
  onSkip,
}: TooltipProps) {
  const { colors: c } = useTheme();
  const { width, height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, {
      toValue: 1,
      friction: 9,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [anim, stepNumber]);

  const CARD_W = Math.min(width - 32, 360);
  const CARD_H = 190;
  const GAP = 14;

  // Prefer below the target; fall back above when there is no room.
  const spaceBelow = height - (rect.y + rect.height);
  const below = spaceBelow >= CARD_H + GAP + 24;
  const top = below ? rect.y + rect.height + GAP : Math.max(12, rect.y - CARD_H - GAP);

  // Keep the card horizontally inside the viewport.
  const left = Math.max(16, Math.min(rect.x + rect.width / 2 - CARD_W / 2, width - CARD_W - 16));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.tooltip,
        {
          width: CARD_W,
          top,
          left,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      <View style={[styles.tooltipCard, { backgroundColor: c.surface, borderColor: c.line }]}>
        <View style={styles.tooltipHeader}>
          <View style={[styles.tooltipIcon, { backgroundColor: 'rgba(249,115,22,0.16)' }]}>
            <Ionicons name={icon} size={18} color={ORANGE} />
          </View>
          <Text style={[styles.tooltipTitle, { color: c.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.tooltipCounter, { color: c.muted }]}>
            {stepNumber}/{totalSteps}
          </Text>
        </View>

        <Text style={[styles.tooltipBody, { color: c.textSoft }]}>{body}</Text>

        <View style={styles.tooltipFooter}>
          <Pressable
            onPress={onSkip}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Skip the tour"
          >
            <Text style={[styles.tooltipSkip, { color: c.muted }]}>Skip</Text>
          </Pressable>

          <Pressable
            onPress={onNext}
            style={({ pressed }) => [styles.tooltipNext, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Finish the tour' : 'Next step'}
          >
            <Text style={styles.tooltipNextText}>{isLast ? 'Done' : 'Next'}</Text>
            <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}


/* ------------------------------ main overlay ------------------------------ */

/**
 * AppTourOverlay — renders the welcome card and the spotlight steps.
 * Mount it once, above the navigation stack.
 */
export function AppTourOverlay() {
  const {
    status,
    step,
    stepIndex,
    totalSteps,
    getTargetRef,
    scrollContainerRef,
    getScrollOffsetY,
    nextStep,
    skipTour,
    startTour,
    dismissWelcome,
  } = useAppTour();

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const measureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<RNView>(null);

  // Usable viewport inside the status bar and the floating bottom nav.
  const viewportTop = insets.top + 12;
  const viewportBottom = windowHeight - Math.max(insets.bottom, 0) - 118;

  /**
   * Scroll the hosting screen so the target is fully visible, then re-measure.
   * Uses the window rect plus the current scroll offset to work out the
   * absolute scroll position that brings the target into the viewport.
   */
  const revealTarget = useCallback(
    (current: Rect) => {
      if (step?.fixed) return false;
      const scroller = scrollContainerRef.current;
      if (!scroller) return false;

      let delta = 0;
      if (current.y < viewportTop) {
        delta = current.y - viewportTop;
      } else if (current.y + current.height > viewportBottom) {
        delta = current.y + current.height - viewportBottom;
      }
      if (delta === 0) return false;

      const next = Math.max(0, getScrollOffsetY() + delta);
      scroller.scrollTo({ y: next, animated: true });
      return true;
    },
    [step?.fixed, scrollContainerRef, getScrollOffsetY, viewportTop, viewportBottom],
  );

  // Measure whenever the step changes; retry so late-mounted views and
  // post-scroll layouts eventually settle.
  useEffect(() => {
    if (status !== 'running' || !step) return;
    setReady(false);

    let tries = 0;
    let scrolled = false;
    const attempt = () => {
      const node = getTargetRef(step.id)?.current;
      if (!node) {
        if (tries < 30) measureTimer.current = setTimeout(attempt, 120);
        tries += 1;
        return;
      }
      const overlayNode = overlayRef.current;
      if (!overlayNode) {
        if (tries < 30) measureTimer.current = setTimeout(attempt, 120);
        tries += 1;
        return;
      }
      if (!measureTarget(overlayNode, (overlayOrigin) => {
        if (!measureTarget(node, (current) => {
          const { x, y, width, height } = current;
          if (width <= 0 || height <= 0) {
            if (tries < 30) measureTimer.current = setTimeout(attempt, 120);
            tries += 1;
            return;
          }
          // Only nudge the screen once per step, then settle into measuring.
          if (!scrolled && revealTarget(current)) {
            scrolled = true;
            measureTimer.current = setTimeout(attempt, 420);
            return;
          }
          setRect({
            x: current.x - overlayOrigin.x,
            y: current.y - overlayOrigin.y,
            width: current.width,
            height: current.height,
          });
          setReady(true);
        })) {
          if (tries < 30) measureTimer.current = setTimeout(attempt, 120);
        }
      })) {
        if (tries < 30) measureTimer.current = setTimeout(attempt, 120);
      }
      tries += 1;
    };

    attempt();
    return () => {
      if (measureTimer.current) clearTimeout(measureTimer.current);
    };
  }, [status, step, getTargetRef, revealTarget]);

  if (status === 'idle') return null;

  if (status === 'welcome') {
    return (
      <TourWelcome
        onStart={startTour}
        onDismiss={dismissWelcome}
      />
    );
  }

  if (!step) return null;

  const isLast = stepIndex >= totalSteps - 1;

  return (
    <View
      ref={overlayRef}
      collapsable={false}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <Spotlight rect={ready ? rect : { x: 0, y: 0, width: 0, height: 0 }}>
        {ready && (
          <TourTooltip
            title={step.title}
            body={step.body}
            icon={step.icon}
            stepNumber={stepIndex + 1}
            totalSteps={totalSteps}
            isLast={isLast}
            rect={rect}
            onNext={nextStep}
            onSkip={skipTour}
          />
        )}
      </Spotlight>
    </View>
  );
}


const styles = StyleSheet.create({
  targetWrapper: {
    alignSelf: 'stretch',
  },
  modalRoot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  welcomeCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  welcomeIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  welcomeTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-700Bold',
    textAlign: 'center',
  },
  welcomeBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  welcomeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5A220',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 22,
    marginTop: 20,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  welcomeCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Poppins-600SemiBold',
  },
  welcomeSkip: {
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  welcomeSkipText: {
    fontSize: 13,
    fontFamily: 'Poppins-500Medium',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  tooltip: {
    position: 'absolute',
  },
  tooltipCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tooltipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-700Bold',
  },
  tooltipCounter: {
    fontSize: 12,
    fontFamily: 'Poppins-500Medium',
  },
  tooltipBody: {
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 10,
  },
  tooltipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  tooltipSkip: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tooltipSkipText: {
    fontSize: 13,
    fontFamily: 'Poppins-500Medium',
  },
  tooltipNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5A220',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  tooltipNextText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-600SemiBold',
  },
});
