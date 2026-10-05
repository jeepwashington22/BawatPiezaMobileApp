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
 * Full-bleed hero art height. Mirrors the reference template, where the top
 * illustration / map / collage fills roughly the upper half of the screen.
 */
const HERO_H = SCREEN_H * 0.56;

/** AsyncStorage flag marking the boarding walkthrough as completed. */
const ONBOARDING_SEEN_KEY = "bawatpieza.onboarding.seen";

/* ------------------------------ brand tokens ------------------------------ */
const ACCENT = "#F97316";
const INK = "#FFFFFF";
const INK_SOFT = "rgba(255,255,255,0.68)";

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

  // Only the visible slide should be decoding frames.
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
      // textureView lets the Skip pill / dots composite on top of the video on Android.
      surfaceType="textureView"
    />
  );
}

/* ------------------------------ the AI visual ----------------------------- */

function AiVisual() {
  // Gentle floating loop for the icon badge.
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

  // Scale multiplier resolved outside the worklet.
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
    // Space reserved for the upcoming Dynamo artwork — intentionally empty.
    return (
      <View style={[st.hero, st.placeholder]}>
        <Ionicons
          name="image-outline"
          size={scale(34)}
          color="rgba(15,33,55,0.26)"
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
        ["rgba(15,33,55,0.18)", ACCENT],
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
  // Parallax: the copy drifts slower than the pager and cross-fades at edges.
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
    <View style={st.screen}>
      {/* Slides — full-bleed hero art with the copy swapped underneath */}
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

      {/* Skip — floats over the hero at the top-right (reference style) */}
      <View style={[st.skipRow, { top: insets.top + scale(8) }]}>
        <AnimatedPressable onPress={finish}>
          <View style={st.skipPill}>
            <Text style={st.skipText}>Skip</Text>
            <Ionicons name="chevron-forward" size={scale(13)} color={ACCENT} />
          </View>
        </AnimatedPressable>
      </View>

      {/* Dots — pinned just under the hero art */}
      <View
        style={[st.dotsOverlay, { top: HERO_H + scale(14) }]}
        pointerEvents="none"
      >
        <Dots scrollX={scrollX} />
      </View>

      {/* Bottom actions */}
      <View style={[st.bottom, { paddingBottom: insets.bottom + scale(14) }]}>
        <View style={st.actionsRow}>
          {active > 0 ? (
            <AnimatedPressable
              style={{ width: scale(54) }}
              onPress={() => goTo(active - 1)}
            >
              <View style={st.backButton}>
                <Ionicons name="arrow-back" size={scale(20)} color={INK} />
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
  screen: { flex: 1, backgroundColor: "#120705" },
  pager: { flex: 1 },

  /* hero art (video / placeholder / AI) */
  hero: {
    width: "100%",
    height: HERO_H,
    backgroundColor: "#2A0D06",
    overflow: "hidden",
  },
  heroScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.06)",
    pointerEvents: "none",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#351207",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,33,55,0.06)",
  },
  placeholderText: {
    marginTop: scale(10),
    color: "rgba(255,255,255,0.48)",
    fontSize: scale(12),
    fontFamily: fonts.medium,
  },
  aiVisual: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#351207",
  },
  aiOrb: {
    width: scale(132),
    height: scale(132),
    borderRadius: scale(66),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: ACCENT,
    shadowOpacity: 0.3,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  aiSpark: {
    position: "absolute",
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: "#F6C445",
  },
  aiSparkOne: { top: scale(96), right: scale(70) },
  aiSparkTwo: { bottom: scale(110), left: scale(66), backgroundColor: "#7CB6FF" },

  /* copy under the hero (margin clears the pinned dots row) */
  copy: {
    paddingHorizontal: scale(28),
    marginTop: scale(46),
    alignItems: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: scale(25),
    fontFamily: fonts.extrabold,
    textAlign: "center",
    marginBottom: scale(10),
  },
  body: {
    color: "rgba(255,255,255,0.68)",
    fontSize: scale(12.5),
    lineHeight: scale(19),
    fontFamily: fonts.medium,
    textAlign: "center",
    maxWidth: scale(290),
  },

  /* skip */
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
    backgroundColor: "rgba(255,255,255,0.9)",
    shadowColor: INK,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  skipText: {
    color: "#F97316",
    fontSize: scale(12.5),
    fontFamily: fonts.bold,
    marginRight: scale(2),
  },

  /* dots */
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

  /* bottom actions */
  bottom: {
    paddingHorizontal: scale(20),
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
    borderColor: "rgba(15,33,55,0.16)",
    backgroundColor: "#FFFFFF",
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
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: scale(14.5),
    fontFamily: fonts.extrabold,
  },
  primaryIcon: { marginLeft: scale(6) },
});
