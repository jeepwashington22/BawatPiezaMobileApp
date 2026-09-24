import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  type SharedValue,
  Extrapolation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { fonts } from "../theme";
import { AnimatedPressable, GOLD, NAVY, scale } from "../components/glass-ui";
import type { IoniconName } from "../lib/network";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SCREEN_W = Dimensions.get("window").width;

/** AsyncStorage flag marking the boarding walkthrough as completed. */
const ONBOARDING_SEEN_KEY = "bawatpieza.onboarding.seen";

/* --------------------------------- slides --------------------------------- */

interface SlideDef {
  kicker: string;
  title: string;
  body: string;
  icon: IoniconName;
  tones: [string, string];
}

const SLIDES: SlideDef[] = [
  {
    kicker: "WELCOME TO",
    title: "BawatPieza",
    body: "Every pieza, accounted for. A smarter way to watch over every floor tile in your zones â€” right from your pocket.",
    icon: "grid-outline",
    tones: ["#F6C445", "#E2A617"],
  },
  {
    kicker: "LIVE MONITORING",
    title: "See every tile, live",
    body: "Foot traffic, energy draw and tile health stream in real time, so nothing happens on your floor without you knowing.",
    icon: "pulse-outline",
    tones: ["#38BDF8", "#0EA5E9"],
  },
  {
    kicker: "SMART ALERTS",
    title: "Know before it breaks",
    body: "BawatPieza watches the patterns for you and raises the alarm the moment a tile, sensor or circuit acts up.",
    icon: "notifications-outline",
    tones: ["#F97316", "#EA580C"],
  },
  {
    kicker: "SECURE SIGN-IN",
    title: "Protected by 2FA",
    body: "Sign in with email and a 6-digit verification code, plus instant security alerts if someone tries your account.",
    icon: "shield-checkmark-outline",
    tones: ["#4ADE80", "#22C55E"],
  },
];

/* ------------------------------- one slide -------------------------------- */

function Slide({
  slide,
  index,
  scrollX,
}: {
  slide: SlideDef;
  index: number;
  scrollX: SharedValue<number>;
}) {
  // Parallax: content drifts slower than the pager and cross-fades at edges.
  const content = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_W, index * SCREEN_W, (index + 1) * SCREEN_W],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: (scrollX.value - index * SCREEN_W) * 0.28 }],
  }));

  // Gentle floating loop for the icon badge.
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [float]);

  // FIX: Calculate the scale multiplier outside the worklet
  const floatYScale = scale(10);

  const iconWrap = useAnimatedStyle(() => ({
    transform: [
      { translateY: -float.value * floatYScale },
      { scale: 1 + float.value * 0.04 },
    ],
  }));

  return (
    <View style={{ width: SCREEN_W, paddingHorizontal: scale(28) }}>
      <Animated.View style={content}>
        <Animated.View style={iconWrap}>
          <LinearGradient
            colors={slide.tones}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.iconChip}
          >
            <Ionicons name={slide.icon} size={scale(44)} color="#FFFFFF" />
          </LinearGradient>
          <View style={st.iconHalo} />
        </Animated.View>

        <View style={st.copyBlock}>
          <Text style={st.kicker}>{slide.kicker}</Text>
          <Text style={st.title}>{slide.title}</Text>
          <Text style={st.body}>{slide.body}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/* ------------------------------ dots indicator ---------------------------- */

function Dot({
  index,
  scrollX,
}: {
  index: number;
  scrollX: SharedValue<number>;
}) {
  // Width stretches for the active dot and morphs smoothly while swiping.
  const style = useAnimatedStyle(() => {
    const t = interpolate(
      scrollX.value,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      width: withSpring(6 + t * 16, { damping: 20, stiffness: 260 }),
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        ["rgba(255,255,255,0.28)", GOLD],
      ),
    };
  });
  return <Animated.View style={[st.dot, style]} />;
}

function Dots({ scrollX }: { scrollX: SharedValue<number> }) {
  return (
    <View style={st.dotsRow}>
      {SLIDES.map((_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} />
      ))}
    </View>
  );
}

/* --------------------------- the boarding screen -------------------------- */

export default function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const isLast = active === SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  // Index follows the pager continuously (also works on web, where momentum
  // end events are unreliable).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      SLIDES.length - 1,
      Math.max(0, Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)),
    );
    setActive((prev) => (prev === next ? prev : next));
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
  };

  /** Records completion and hands control back to the login gate. */
  const finish = () => {
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1").catch(() => {});
    if (onDone) onDone();
    else router.replace("/");
  };

  return (
    <LinearGradient
      colors={["#0A2A4A", "#0C2038", "#071527"]}
      style={StyleSheet.absoluteFill}
    >
      <SafeAreaView style={st.safe}>
        {/* Skip */}
        <View style={st.skipRow}>
          <AnimatedPressable onPress={finish}>
            <View style={st.skipPill}>
              <Text style={st.skipText}>Skip</Text>
              <Ionicons
                name="chevron-forward"
                size={scale(14)}
                color="rgba(255,255,255,0.7)"
              />
            </View>
          </AnimatedPressable>
        </View>

        {/* Slides */}
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onScroll}
          onScrollEndDrag={onScroll}
          style={st.pager}
        >
          {SLIDES.map((slide, i) => (
            <Slide key={i} slide={slide} index={i} scrollX={scrollX} />
          ))}
        </Animated.ScrollView>

        {/* Dots + actions */}
        <View style={st.bottom}>
          <Dots scrollX={scrollX} />

          <View style={st.actionsRow}>
            {active > 0 ? (
              <AnimatedPressable onPress={() => goTo(active - 1)}>
                <View style={st.ghostButton}>
                  <Ionicons
                    name="chevron-back"
                    size={scale(18)}
                    color="rgba(255,255,255,0.85)"
                  />
                  <Text style={st.ghostText}>Back</Text>
                </View>
              </AnimatedPressable>
            ) : (
              <View style={st.ghostSpacer} />
            )}

            <AnimatedPressable
              onPress={() => (isLast ? finish() : goTo(active + 1))}
            >
              <LinearGradient
                colors={isLast ? [GOLD, "#E2A617"] : [NAVY, "#345271"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={st.primaryButton}
              >
                <Text style={[st.primaryText, isLast && st.primaryTextOnGold]}>
                  {isLast ? "Get started" : "Next"}
                </Text>
                <Ionicons
                  name={isLast ? "arrow-forward" : "chevron-forward"}
                  size={scale(16)}
                  color={isLast ? NAVY : "#FFFFFF"}
                  style={st.primaryIcon}
                />
              </LinearGradient>
            </AnimatedPressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* --------------------------------- styles --------------------------------- */

const st = StyleSheet.create({
  safe: { flex: 1 },
  skipRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: scale(20),
    paddingTop: scale(6),
  },
  skipPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: scale(7),
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  skipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: scale(12),
    fontWeight: "700",
    fontFamily: fonts.bold,
    marginRight: scale(2),
  },
  pager: { flex: 1 },
  iconChip: {
    alignSelf: "center",
    width: scale(104),
    height: scale(104),
    borderRadius: scale(30),
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconHalo: {
    alignSelf: "center",
    marginTop: scale(14),
    width: scale(56),
    height: scale(4),
    borderRadius: 4,
    backgroundColor: "rgba(246,196,69,0.35)",
  },
  copyBlock: { alignItems: "center", marginTop: scale(30) },
  kicker: {
    color: GOLD,
    fontSize: scale(11),
    letterSpacing: 3,
    fontWeight: "800",
    fontFamily: fonts.extrabold,
    marginBottom: scale(10),
  },
  title: {
    color: "#FFFFFF",
    fontSize: scale(28),
    fontWeight: "800",
    fontFamily: fonts.extrabold,
    textAlign: "center",
    marginBottom: scale(12),
  },
  body: {
    color: "rgba(255,255,255,0.72)",
    fontSize: scale(13.5),
    lineHeight: scale(21),
    fontFamily: fonts.medium,
    textAlign: "center",
    maxWidth: scale(300),
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: scale(6),
    marginBottom: scale(22),
  },
  bottom: { paddingBottom: scale(14) },
  dot: { height: scale(6), borderRadius: 99 },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(20),
    paddingBottom: scale(10),
  },
  ghostButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
  },
  ghostText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: scale(13),
    fontWeight: "700",
    fontFamily: fonts.bold,
    marginLeft: scale(2),
  },
  ghostSpacer: { width: scale(74) },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: scale(30),
    paddingVertical: scale(15),
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: scale(14),
    fontWeight: "800",
    fontFamily: fonts.extrabold,
  },
  primaryTextOnGold: { color: NAVY },
  primaryIcon: { marginLeft: scale(6) },
});
