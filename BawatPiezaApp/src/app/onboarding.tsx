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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useVideoPlayer, VideoView } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fonts } from "../theme";
import { AnimatedPressable, scale } from "../components/glass-ui";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/**
 * Full-bleed hero art height exactly at 50% for an even split layout.
 */
const HERO_H = SCREEN_H * 0.50;

/** AsyncStorage flag marking the boarding walkthrough as completed. */
const ONBOARDING_SEEN_KEY = "bawatpieza.onboarding.seen";

/* ------------------------------ brand tokens ------------------------------ */
const ACCENT = "#EA580C";
const TEXT_PRIMARY = "#0F172A";
const TEXT_SECONDARY = "#64748B";
const BORDER = "#E2E8F0";
const BG_LIGHT = "#F8FAFC";

/* --------------------------------- slides --------------------------------- */

interface SlideDef {
  title: string;
  body: string;
  visual: "video" | "placeholder" | "ai";
}

const SLIDES: SlideDef[] = [
  {
    title: "BawatPieza",
    body: "Every pieza, accounted for. A smarter way to watch over every floor tile in your zones, right from your pocket.",
    visual: "video",
  },
  {
    title: "Dynamo",
    body: "Connect your Dynamo experience and keep every part of your operation moving with confidence.",
    visual: "placeholder",
  },
  {
    title: "AI, at your side",
    body: "Let AI turn your data into clear answers, useful insights and better decisions for every piece of your work.",
    visual: "ai",
  },
];

/* ---------------------------- hero: background video ---------------------- */

function HeroVideo({ isActive }: { isActive: boolean }) {
  const player = useVideoPlayer(
    require("../../assets/images/videobg.mp4"),
    (p) => {
      p.loop = true;
      p.muted = true;
      p.play();
    },
  );

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
    />
  );
}

/* ------------------------------ the AI visual ----------------------------- */

function AiVisual() {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [float]);

  const floatYScale = scale(10);

  const orb = useAnimatedStyle(() => ({
    transform: [
      { translateY: -float.value * floatYScale },
      { scale: 1 + float.value * 0.04 },
    ],
  }));

  return (
    <View style={[st.hero, st.aiVisual]}>
      <Animated.View style={[st.aiOrb, orb]}>
        <Ionicons name="sparkles" size={scale(48)} color={ACCENT} />
      </Animated.View>
      <View style={[st.aiSpark, st.aiSparkOne]} />
      <View style={[st.aiSpark, st.aiSparkTwo]} />
    </View>
  );
}

/* --------------------------- hero: pick one visual ------------------------ */

function Visual({ slide, isActive }: { slide: SlideDef; isActive: boolean }) {
  if (slide.visual === "video") {
    return (
      <View style={st.hero}>
        <HeroVideo isActive={isActive} />
        <View style={st.heroScrim} />
      </View>
    );
  }

  if (slide.visual === "placeholder") {
    return (
      <View style={[st.hero, st.placeholder]}>
        <Ionicons
          name="image-outline"
          size={scale(34)}
          color="#CBD5E1"
        />
        <Text style={st.placeholderText}>Dynamo visual coming soon</Text>
      </View>
    );
  }

  return <AiVisual />;
}

/* ------------------------------ dots indicator ---------------------------- */

function Dot({
  index,
  scrollX,
}: {
  index: number;
  scrollX: SharedValue<number>;
}) {
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
        ["#CBD5E1", ACCENT],
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

/* ------------------------------- one slide -------------------------------- */

function Slide({
  slide,
  index,
  scrollX,
  isActive,
}: {
  slide: SlideDef;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
}) {
  const content = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_W, index * SCREEN_W, (index + 1) * SCREEN_W],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: (scrollX.value - index * SCREEN_W) * 0.28 }],
  }));

  return (
    <View style={{ width: SCREEN_W }}>
      <Visual slide={slide} isActive={isActive} />

      <Animated.View style={[content, st.copy]}>
        <Text style={st.title}>{slide.title}</Text>
        <Text style={st.body}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

/* --------------------------- the boarding screen -------------------------- */

export default function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const isLast = active === SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

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

  const finish = () => {
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1").catch(() => {});
    if (onDone) onDone();
    else router.replace("/");
  };

  return (
    <View style={st.screen}>
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
          <Slide
            key={i}
            slide={slide}
            index={i}
            scrollX={scrollX}
            isActive={i === active}
          />
        ))}
      </Animated.ScrollView>

      <View style={[st.skipRow, { top: insets.top + scale(8) }]}>
        <AnimatedPressable onPress={finish}>
          <View style={st.skipPill}>
            <Text style={st.skipText}>Skip</Text>
            <Ionicons name="chevron-forward" size={scale(13)} color={TEXT_SECONDARY} />
          </View>
        </AnimatedPressable>
      </View>

      <View
        style={[st.dotsOverlay, { top: HERO_H + scale(24) }]}
        pointerEvents="none"
      >
        <Dots scrollX={scrollX} />
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + scale(16) }]}>
        <View style={st.actionsRow}>
          {active > 0 ? (
            <AnimatedPressable
              style={{ width: scale(54) }}
              onPress={() => goTo(active - 1)}
            >
              <View style={st.backButton}>
                <Ionicons name="arrow-back" size={scale(20)} color={TEXT_PRIMARY} />
              </View>
            </AnimatedPressable>
          ) : null}

          <AnimatedPressable
            style={{ flex: 1 }}
            onPress={() => (isLast ? finish() : goTo(active + 1))}
          >
            <View style={st.primaryButton}>
              <Text style={st.primaryText}>
                {isLast ? "Get started" : "Next"}
              </Text>
              <Ionicons
                name={isLast ? "arrow-forward" : "chevron-forward"}
                size={scale(16)}
                color="#FFFFFF"
                style={st.primaryIcon}
              />
            </View>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

/* --------------------------------- styles --------------------------------- */

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  pager: { flex: 1 },

  hero: {
    width: "100%",
    height: HERO_H,
    backgroundColor: BG_LIGHT,
    overflow: "hidden",
  },
  heroScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.02)",
    pointerEvents: "none",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  placeholderText: {
    marginTop: scale(10),
    color: TEXT_SECONDARY,
    fontSize: scale(13),
    fontFamily: fonts.medium,
  },
  aiVisual: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  aiOrb: {
    width: scale(132),
    height: scale(132),
    borderRadius: scale(66),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: ACCENT,
    shadowOpacity: 0.15,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  aiSpark: {
    position: "absolute",
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: "#F59E0B",
  },
  aiSparkOne: { top: scale(96), right: scale(70) },
  aiSparkTwo: { bottom: scale(110), left: scale(66), backgroundColor: "#3B82F6" },

  copy: {
    paddingHorizontal: scale(32),
    marginTop: scale(64),
    alignItems: "center",
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: scale(26),
    fontFamily: fonts.extrabold,
    textAlign: "center",
    marginBottom: scale(12),
  },
  body: {
    color: TEXT_SECONDARY,
    fontSize: scale(14),
    lineHeight: scale(22),
    fontFamily: fonts.medium,
    textAlign: "center",
    maxWidth: scale(310),
  },

  skipRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    paddingHorizontal: scale(20),
    zIndex: 10,
  },
  skipPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: scale(7),
    borderRadius: 99,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  skipText: {
    color: TEXT_SECONDARY,
    fontSize: scale(12.5),
    fontFamily: fonts.bold,
    marginRight: scale(2),
  },

  dotsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  dot: { height: scale(6), borderRadius: 99 },

  bottom: {
    paddingHorizontal: scale(24),
    paddingTop: scale(10),
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
  },
  backButton: {
    width: scale(54),
    height: scale(54),
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  primaryButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
    backgroundColor: ACCENT,
    paddingVertical: scale(17),
    paddingHorizontal: scale(24),
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: scale(15),
    fontFamily: fonts.extrabold,
  },
  primaryIcon: { marginLeft: scale(6) },
});