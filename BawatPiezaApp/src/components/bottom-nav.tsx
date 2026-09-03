import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';

/**
 * BottomNav — React Native port of the web dashboard's BottomNav.
 * Same set of destinations, labels, icons and active-state styling, wired to
 * expo-router for navigation.
 */

const PRUSSIAN = '#0A2A4A';
const BUTTER = '#F6C445';
const MUTED = 'rgba(10, 42, 74, 0.62)';
const FAINT = 'rgba(10, 42, 74, 0.42)';
const LINE = 'rgba(10, 42, 74, 0.12)';

type IconName = keyof typeof Ionicons.glyphMap;

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  activeIcon: IconName;
};

const items: NavItem[] = [
  { label: 'Home', href: '/home', icon: 'home-outline', activeIcon: 'home' },
  { label: 'Energy', href: '/pages/energy', icon: 'flash-outline', activeIcon: 'flash' },
  { label: 'Heatmap', href: '/pages/heatmap', icon: 'grid-outline', activeIcon: 'grid' },
  { label: 'Report', href: '/pages/reports', icon: 'document-text-outline', activeIcon: 'document-text' },
  { label: 'Schedule', href: '/pages/schedule', icon: 'calendar-outline', activeIcon: 'calendar' },
  { label: 'Accounts', href: '/pages/accounts', icon: 'people-outline', activeIcon: 'people' },
  { label: 'Profile', href: '/pages/profile', icon: 'person-outline', activeIcon: 'person' },
];

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/home'
      ? pathname === '/home'
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map(({ label, href, icon, activeIcon }) => {
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
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Ionicons
                  name={active ? activeIcon : icon}
                  size={20}
                  color={active ? BUTTER : MUTED}
                />
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    minWidth: 62,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: PRUSSIAN,
    shadowColor: PRUSSIAN,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: FAINT,
  },
  labelActive: {
    color: PRUSSIAN,
    fontWeight: '700',
  },
});