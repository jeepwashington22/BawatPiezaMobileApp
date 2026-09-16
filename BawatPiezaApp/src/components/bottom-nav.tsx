import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useTheme } from '../theme';

/**
 * BottomNav — 5 destinations: Home, Power Management, Energy (raised center bolt),
 * Reports and Profile. Theme-aware (light/dark) with Poppins labels.
 */

type IconName = keyof typeof Ionicons.glyphMap;

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  activeIcon: IconName;
};

// Order matters: [left items…] center FAB [right items…]
const LEFT: NavItem[] = [
  { label: 'Home', href: '/home', icon: 'home-outline', activeIcon: 'home' },
  { label: 'Power Management', href: '/pages/heatmap', icon: 'power-outline', activeIcon: 'power' },
];
const RIGHT: NavItem[] = [
  { label: 'Reports', href: '/pages/reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
  { label: 'Profile', href: '/pages/profile', icon: 'person-outline', activeIcon: 'person' },
];
const CENTER = { label: 'Energy', href: '/pages/energy' };

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors: c, fonts: f } = useTheme();

  const isActive = (href: string) =>
    href === '/home'
      ? pathname === '/home'
      : pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = ({ label, href, icon, activeIcon }: NavItem) => {
    const active = isActive(href);
    return (
      <Pressable
        key={href}
        onPress={() => router.push(href as Href)}
        style={styles.item}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
      >
        <Ionicons name={active ? activeIcon : icon} size={22} color={active ? c.text : c.muted} />
        <Text
          numberOfLines={2}
          style={[styles.label, { color: active ? c.text : c.muted, fontFamily: active ? f.bold : f.medium }]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.tabBar, borderTopColor: c.line }]}>
      {LEFT.map(renderItem)}

      {/* Raised center Energy button */}
      <Pressable
        onPress={() => router.push(CENTER.href as Href)}
        style={({ pressed }) => [styles.centerBtn, { borderColor: c.tabBar }, pressed && styles.centerBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={CENTER.label}
      >
        <Ionicons name="flash" size={26} color="#FFFFFF" />
      </Pressable>

      {RIGHT.map(renderItem)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    paddingVertical: 2,
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
  },
  centerBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
    borderWidth: 4,
    shadowColor: '#EA580C',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  centerBtnPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
});