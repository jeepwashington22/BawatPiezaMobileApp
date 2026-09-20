import type { Ionicons } from '@expo/vector-icons';

/**
 * Navigation model shared by the top nav (burger → side menu) and the
 * bottom nav. Keeping the destinations in one place means a new page only
 * ever has to be registered once and every entry point picks it up.
 */

export type NavIconName = keyof typeof Ionicons.glyphMap;

export type NavItem = {
  /** Label shown in the side menu and in the top bar's active-page line. */
  label: string;
  /** expo-router path (see `src/app/**`). */
  href: string;
  /** Outline icon — idle state. */
  icon: NavIconName;
  /** Filled icon — active state. */
  activeIcon: NavIconName;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/** Side-menu layout: grouped destinations in the order they are rendered. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Home', href: '/home', icon: 'home-outline', activeIcon: 'home' },
      { label: 'Energy', href: '/pages/energy', icon: 'flash-outline', activeIcon: 'flash' },
      { label: 'Power Management', href: '/pages/heatmap', icon: 'power-outline', activeIcon: 'power' },
      { label: 'Schedule', href: '/pages/schedule', icon: 'calendar-outline', activeIcon: 'calendar' },
      { label: 'Reports', href: '/pages/reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Profile', href: '/pages/profile', icon: 'person-outline', activeIcon: 'person' },
      { label: 'My Account', href: '/pages/edit-profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
      { label: 'Shared Users', href: '/pages/accounts', icon: 'people-outline', activeIcon: 'people' },
      { label: 'Device', href: '/pages/device', icon: 'hardware-chip-outline', activeIcon: 'hardware-chip' },
      { label: 'Preferences', href: '/pages/preferences', icon: 'options-outline', activeIcon: 'options' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'About', href: '/pages/about', icon: 'information-circle-outline', activeIcon: 'information-circle' },
    ],
  },
];

/** Flat list of every destination — handy for title lookups. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Resolves the label of the page matching `pathname`.
 * Nested routes (`/pages/reports/summary`) resolve to their parent entry.
 */
export function activeNavLabel(pathname: string, fallback = 'Home'): string {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? fallback;
}
