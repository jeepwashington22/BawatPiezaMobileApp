import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter, type Href } from 'expo-router';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fonts, type Mode, useTheme } from '../theme';
import { NAV_SECTIONS, activeNavLabel, type NavItem } from '../constants/navigation';
import { supabase } from '../lib/supabase';
import { brandAccent, scale } from './glass-ui';

/**
 * MenuButton — the burger button that lives in the top nav.
 * Idle it is a quiet surface chip; `open` tints it gold to echo the drawer.
 */
export function MenuButton({
  open = false,
  onPress,
  accessibilityLabel = 'Open navigation menu',
}: {
  open?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors: c, mode } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.burger,
        {
          backgroundColor: open ? c.accentSoft : c.surface,
          borderColor: open ? brandAccent(mode, 0.55) : c.line,
        },
        pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Ionicons name="menu" size={scale(20)} color={open ? brandAccent(mode) : c.text} />
    </Pressable>
  );
}

/* ------------------------------- nav row --------------------------------- */

function NavRow({
  item,
  active,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
}) {
  const { colors: c, mode } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      style={({ pressed }) => [
        styles.row,
        active
          ? { backgroundColor: c.accentSoft, borderColor: brandAccent(mode, 0.45) }
          : { backgroundColor: 'transparent', borderColor: 'transparent' },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: active
              ? brandAccent(mode, 0.20)
              : mode === 'dark'
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(10,42,74,0.05)',
          },
        ]}
      >
        <Ionicons
          name={active ? item.activeIcon : item.icon}
          size={scale(17)}
          color={active ? brandAccent(mode) : c.muted}
        />
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.rowLabel,
          {
            color: active ? c.text : c.textSoft,
            fontFamily: active ? fonts.bold : fonts.medium,
          },
        ]}
      >
        {item.label}
      </Text>

      {active ? (
        <View style={[styles.activeDot, { backgroundColor: brandAccent(mode) }]} />
      ) : (
        <Ionicons name="chevron-forward" size={scale(14)} color={c.muted} />
      )}
    </Pressable>
  );
}

const MODES: { key: Mode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'light', icon: 'sunny-outline', label: 'Light' },
  { key: 'dark', icon: 'moon-outline', label: 'Dark' },
];

/* ------------------------------- side menu -------------------------------- */

/** Panel never grows past this width, and always leaves a slice of page visible. */
const PANEL_MAX_W = 320;

/**
 * SideMenu — the slide-in navigation drawer behind the top nav's burger.
 *
 * Rendered through a native `Modal` on purpose: the top bar sits inside
 * `ScreenShell`'s `ScrollView`, so an absolutely positioned drawer would be
 * clipped by the scroll bounds and scroll away with the page. A modal overlays
 * the whole app instead, which is what a navigation side panel must do.
 *
 * The panel slides in with Reanimated (`progress` 0 → 1) while the backdrop
 * fades in behind it; `rendered` keeps the modal mounted until the closing
 * animation finishes. User identity is passed in by the top bar so the drawer
 * reuses that session lookup instead of firing a second request.
 */
export function SideMenu({
  visible,
  onClose,
  name,
  email,
  avatarUrl,
}: {
  visible: boolean;
  onClose: () => void;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}) {
  const { colors: c, mode, setMode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const panelW = Math.min(PANEL_MAX_W, Math.round(width * 0.84));
  const progress = useSharedValue(0);
  const [rendered, setRendered] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (visible) {
      wasOpen.current = true;
      setRendered(true);
      progress.value = 0;
      progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setRendered)(false);
    });
  }, [visible, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -panelW * (1 - progress.value) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const firstName = name ? name.trim().split(' ')[0] : null;
  const displayName = name ?? email ?? 'Signed-in user';
  const activeLabel = activeNavLabel(pathname);

  const isActive = (href: string) =>
    href === '/home' ? pathname === '/home' : pathname === href || pathname.startsWith(`${href}/`);

  /** Close first, then navigate — so the drawer is gone when the page settles. */
  const goTo = (item: NavItem) => {
    const alreadyHere = isActive(item.href);
    onClose();
    if (!alreadyHere) router.push(item.href as Href);
  };

  const handleSignOut = async () => {
    onClose();
    try {
      await supabase.auth.signOut();
    } catch {
      // Session may already be gone locally — still return to the login gate.
    }
    router.replace('/');
  };

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.backdrop,
            {
              backgroundColor:
                mode === 'dark' ? 'rgba(0, 0, 0, 0.72)' : 'rgba(4, 10, 20, 0.55)',
            },
            backdropStyle,
          ]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
        />

        <Animated.View
          style={[
            styles.panel,
            { width: panelW, backgroundColor: c.surface, borderRightColor: c.line },
            panelStyle,
          ]}
        >
          {/* hero — brand + signed-in identity */}
          <LinearGradient
            colors={
              mode === 'dark'
                ? ['#000000', '#0B0B0B', '#171717']
                : ['#0A2A4A', '#123B66', '#1B4D8F']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + scale(16) }]}
          >
            <View style={[styles.heroTrim, { backgroundColor: brandAccent(mode, 0.9) }]} />
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close navigation menu"
            >
              <Ionicons name="close" size={scale(16)} color="rgba(255,255,255,0.85)" />
            </Pressable>

            <View style={styles.heroRow}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={[styles.avatar, { borderColor: brandAccent(mode) }]}
                />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    styles.avatarFallback,
                    { borderColor: brandAccent(mode), backgroundColor: brandAccent(mode, 0.2) },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: brandAccent(mode) }]}>
                    {(firstName ?? 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.heroText}>
                <Text
                  style={[
                    styles.heroBrand,
                    {
                      color:
                        mode === 'dark' ? 'rgba(255,255,255,0.60)' : 'rgba(246,196,69,0.95)',
                    },
                  ]}
                >
                  BAWATPIEZA
                </Text>
                <Text numberOfLines={1} style={styles.heroName}>
                  {displayName}
                </Text>
                <View style={[styles.livePill, { borderColor: brandAccent(mode, 0.35) }]}>
                  <View
                    style={[
                      styles.liveDot,
                      { backgroundColor: mode === 'dark' ? '#FFFFFF' : '#6EE7A0' },
                    ]}
                  />
                  <Text numberOfLines={1} style={styles.liveText}>
                    LIVE · {activeLabel.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* destinations */}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {NAV_SECTIONS.map((section) => (
              <View key={section.title}>
                <View style={styles.sectionHead}>
                  <View
                    style={[styles.sectionTick, { backgroundColor: brandAccent(mode, 0.9) }]}
                  />
                  <Text style={[styles.sectionTitle, { color: c.muted }]}>
                    {section.title.toUpperCase()}
                  </Text>
                </View>
                {section.items.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isActive(item.href)}
                    onPress={() => goTo(item)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>

          {/* footer — theme switch + sign out */}
          <View
            style={[
              styles.footer,
              { borderTopColor: c.line, paddingBottom: insets.bottom + scale(12) },
            ]}
          >
            <View
              style={[styles.segment, { backgroundColor: c.surfaceMuted, borderColor: c.line }]}
            >
              {MODES.map((m) => {
                const on = mode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => setMode(m.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${m.label} theme`}
                    style={[styles.segmentItem, on && { backgroundColor: c.accent }]}
                  >
                    <Ionicons name={m.icon} size={scale(14)} color={on ? c.onAccent : c.muted} />
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: on ? c.onAccent : c.textSoft,
                          fontFamily: on ? fonts.bold : fonts.medium,
                        },
                      ]}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ pressed }) => [
                styles.signOut,
                // light keeps the red destructive tint; the B/W dark theme uses
                // a plain hairline + surface instead of a hue
                mode === 'dark'
                  ? { borderColor: c.line, backgroundColor: c.surfaceMuted }
                  : {
                      borderColor: 'rgba(220, 38, 38, 0.35)',
                      backgroundColor: 'rgba(220, 38, 38, 0.08)',
                    },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons
                name="log-out-outline"
                size={scale(16)}
                color={mode === 'dark' ? c.text : c.danger}
              />
              <Text style={[styles.signOutText, { color: mode === 'dark' ? c.text : c.danger }]}>
                Sign out
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}


/* ------------------------------- styles ----------------------------------- */

const styles = StyleSheet.create({
  /* burger button in the top nav */
  burger: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(13),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    height: '100%',
    borderRightWidth: 1,
    borderTopRightRadius: scale(24),
    borderBottomRightRadius: scale(24),
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 8, height: 0 },
    elevation: 18,
  },

  /* hero */
  hero: {
    paddingHorizontal: scale(18),
    paddingBottom: scale(16),
    overflow: 'hidden',
  },
  heroTrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: scale(3),
    opacity: 0.9,
  },
  closeBtn: {
    position: 'absolute',
    top: scale(12),
    right: scale(12),
    width: scale(30),
    height: scale(30),
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginTop: scale(18),
  },
  avatar: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    borderWidth: 2,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: scale(19),
    fontFamily: fonts.extrabold,
  },
  heroText: {
    flex: 1,
    paddingRight: scale(28),
  },
  heroBrand: {
    fontSize: scale(8.5),
    letterSpacing: 2,
    fontFamily: fonts.extrabold,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: scale(16),
    fontFamily: fonts.extrabold,
    marginTop: 1,
  },
  livePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    marginTop: scale(7),
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    maxWidth: '100%',
  },
  liveDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: 99,
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: scale(8),
    letterSpacing: 1.2,
    fontFamily: fonts.bold,
  },

  /* destinations */
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: scale(12),
    paddingTop: scale(14),
    paddingBottom: scale(18),
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingHorizontal: scale(6),
    marginTop: scale(14),
    marginBottom: scale(7),
  },
  sectionTick: {
    width: scale(3),
    height: scale(11),
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: scale(9),
    letterSpacing: 1.6,
    fontFamily: fonts.extrabold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(11),
    borderRadius: scale(13),
    borderWidth: 1,
    paddingHorizontal: scale(10),
    paddingVertical: scale(9),
    marginBottom: scale(4),
  },
  rowIcon: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: scale(12.5),
  },
  activeDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: 99,
  },

  /* footer */
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: scale(14),
    paddingTop: scale(12),
    gap: scale(10),
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: scale(3),
    gap: scale(3),
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    borderRadius: 999,
    paddingVertical: scale(7),
  },
  segmentText: {
    fontSize: scale(11),
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    borderRadius: scale(13),
    borderWidth: 1,
    paddingVertical: scale(11),
  },
  signOutText: {
    fontSize: scale(12),
    fontFamily: fonts.bold,
  },
});

