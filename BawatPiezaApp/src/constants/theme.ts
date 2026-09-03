/**
 * Shared design tokens for the BawatPieza mobile app.
 * These colors match the web dashboard branding for a single-source visual system.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0A2A4A',
    background: '#F4F4F4',
    backgroundElement: '#EAF1F7',
    backgroundSelected: '#DDEAF5',
    textSecondary: 'rgba(10, 42, 74, 0.62)',
    brand: '#0A2A4A',
    brandSoft: '#3B5B7A',
    accent: '#F6C445',
    surface: '#FFFFFF',
    line: 'rgba(10, 42, 74, 0.12)',
  },
  dark: {
    text: '#E9F0F7',
    background: '#081426',
    backgroundElement: '#0E1F38',
    backgroundSelected: '#16304D',
    textSecondary: 'rgba(233, 240, 247, 0.62)',
    brand: '#123456',
    brandSoft: '#3B5B7A',
    accent: '#FFDD7A',
    surface: '#0E1F38',
    line: 'rgba(233, 240, 247, 0.14)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
