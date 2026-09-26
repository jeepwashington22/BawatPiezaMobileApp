import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { fonts, useTheme, type Mode } from '../theme';

/* ------------------------------ design tokens ----------------------------- */

export const GOLD = '#F6C445';
export const NAVY = '#0A2A4A';

const { width: SCREEN_W } = Dimensions.get('window');
const S = Math.min(1, Math.max(0.82, SCREEN_W / 412));
export const scale = (v: number) => Math.round(v * S * 100) / 100;

/* ------------------------- mode-aware brand colours ----------------------- */

/**
 * Brand accent. Light mode keeps the house gold; dark mode is a strict
 * black-and-white theme, so the same accent resolves to pure white at the same
 * opacity (a 30% gold hairline becomes a 30% white hairline).
 *
 * Use this anywhere the brand colour is mixed with transparency — plain
 * `GOLD` / `NAVY` constants are light-mode values only.
 */
export function brandAccent(mode: Mode, alpha = 1): string {
  return mode === 'dark' ? `rgba(255, 255, 255, ${alpha})` : `rgba(246, 196, 69, ${alpha})`;
}

/**
 * Ink that sits on top of a brand band: navy on the gold band in light mode,
 * black on the white band in dark mode.
 */
export function bandInk(mode: Mode, alpha = 1): string {
  return mode === 'dark' ? `rgba(0, 0, 0, ${alpha})` : `rgba(10, 42, 74, ${alpha})`;
}

/* --------------------------- animated pressable --------------------------- */

export function AnimatedPressable({
  onPress,
  style,
  children,
}: {
  onPress?: () => void;
  style?: any;
  children: React.ReactNode;
}) {
  const press = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Animated.View style={[aStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (press.value = withSpring(0.965, { damping: 18 }))}
        onPressOut={() => (press.value = withSpring(1, { damping: 14 }))}
        style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------- live dot -------------------------------- */

export function LiveDot({ color }: { color: string }) {
  const pulse = useSharedValue(1);
  const opacity = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.8, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1,
    );
  }, [pulse, opacity]);
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: opacity.value,
  }));
  return (
    <View style={{ width: scale(10), height: scale(10), alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[dotStyle, { position: 'absolute', width: scale(10), height: scale(10), borderRadius: 99, backgroundColor: color }]}
      />
      <View style={{ width: scale(4.5), height: scale(4.5), borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

/* ------------------------------ glass surface ----------------------------- */

/** Plain surface card — solid background, hairline border (no blur). */
export function Card({
  mode,
  style,
  children,
}: {
  mode: Mode;
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          borderRadius: scale(18),
          backgroundColor: mode === 'dark' ? '#0E0E0E' : '#FFFFFF',
          borderWidth: 1,
          // dark values mirror DarkTheme.surface / DarkTheme.line
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(10,42,74,0.08)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Glass({ mode, style, children }: { mode: Mode; style?: any; children: React.ReactNode }) {
  return (
    <View
      style={[
        {
          borderRadius: scale(20),
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)',
        },
        style,
      ]}
    >
      {Platform.OS !== 'web' && (
        <BlurView
          intensity={mode === 'dark' ? 36 : 60}
          tint={mode === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: mode === 'dark' ? 'rgba(10, 10, 10, 0.72)' : 'rgba(255, 255, 255, 0.72)' },
        ]}
      />
      <LinearGradient
        colors={
          mode === 'dark'
            ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']
        }
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%' }}
      />
      {children}
    </View>
  );
}

/* ------------------------------ gold toggle ------------------------------- */

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { mode } = useTheme();
  return (
    <Pressable onPress={onToggle} hitSlop={8}>
      <View
        style={{
          width: scale(42),
          height: scale(23),
          borderRadius: 99,
          padding: scale(2),
          justifyContent: 'center',
          alignItems: on ? 'flex-end' : 'flex-start',
          backgroundColor: on ? brandAccent(mode) : 'rgba(150,160,175,0.35)',
        }}
      >
        <View
          style={{
            width: scale(19),
            height: scale(19),
            borderRadius: 99,
            backgroundColor: '#FFFFFF',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        />
      </View>
    </Pressable>
  );
}

/* ------------------------------ section head ------------------------------ */

export function SectionHead({
  title,
  link,
  onLink,
  mode,
}: {
  title: string;
  link?: string;
  onLink?: () => void;
  mode: Mode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: scale(22),
        marginBottom: scale(10),
        paddingHorizontal: scale(2),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(7) }}>
        <View style={{ width: scale(3), height: scale(12), borderRadius: 2, backgroundColor: brandAccent(mode) }} />
        <Text
          style={{
            color: mode === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(10,42,74,0.62)',
            fontSize: scale(9.5),
            letterSpacing: 1.6,
            fontFamily: fonts.extrabold,
          }}
        >
          {title}
        </Text>
      </View>
      {link && (
        <Pressable onPress={onLink} hitSlop={6}>
          <Text style={{ color: brandAccent(mode), fontSize: scale(10.5), fontFamily: fonts.bold }}>{link}</Text>
        </Pressable>
      )}
    </View>
  );
}



