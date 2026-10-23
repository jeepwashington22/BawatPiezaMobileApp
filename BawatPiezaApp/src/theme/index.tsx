import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ---------------------------------- Fonts --------------------------------- */
// Poppins — loaded once in app/_layout.tsx and consumed everywhere via useTheme().
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extrabold: 'Poppins_800ExtraBold',
} as const;

/* --------------------------------- Palettes -------------------------------- */
// Visual hierarchy: bg < surface < accentSurface < text/muted, with
// WCAG-conscious contrast between text and its background in BOTH modes.
export type ThemeColors = {
  bg: string; // screen background
  surface: string; // cards / sheets
  surfaceMuted: string; // subtle inner surfaces (inputs, chips)
  line: string; // hairline borders
  text: string; // primary text — highest contrast
  textSoft: string; // secondary text
  muted: string; // tertiary/caption text
  accent: string; // brand action color (buttons, active states)
  onAccent: string; // text/icons on accent
  accentSoft: string; // soft accent tint (icon chips, highlights)
  onAccentSoft: string; // text on accentSoft
  butter: string;
  orange: string;
  gridGreen: string;
  gridGreenDark: string;
  danger: string;
  onDanger: string;
  ok: string;
  tabBar: string;
};

export const LightTheme: ThemeColors = {
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F8FA',
  line: 'rgba(10, 42, 74, 0.12)',
  text: '#0A2A4A',
  textSoft: 'rgba(10, 42, 74, 0.78)',
  muted: 'rgba(10, 42, 74, 0.60)',
  accent: '#0A2A4A',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(246, 196, 69, 0.22)',
  onAccentSoft: '#0A2A4A',
  butter: '#F6C445',
  orange: '#F97316',
  gridGreen: '#16A34A',
  gridGreenDark: '#22C55E',
  danger: '#DC2626',
  onDanger: '#FFFFFF',
  ok: '#15803D',
  tabBar: 'rgba(255, 255, 255, 0.97)',
};

/**
 * Dark mode — black canvas with warm orange accents.
 *
 * The canvas stays pure black and surfaces near-black so OLED screens stay
 * deep, but the brand accent is the house orange (not white): buttons, active
 * states, loaders and highlights all resolve to orange for a warm, premium dark
 * look. `danger` stays red for destructive actions such as signing out, and
 * `ok` is green for healthy / live states.
 */
export const DarkTheme: ThemeColors = {
  bg: '#000000',
  surface: '#0E0E0E',
  surfaceMuted: '#161616',
  line: 'rgba(255, 255, 255, 0.16)',
  text: '#FFFFFF',
  textSoft: 'rgba(255, 255, 255, 0.80)',
  muted: 'rgba(255, 255, 255, 0.52)',
  accent: '#F97316', // house orange is the action colour in dark mode
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(249, 115, 22, 0.18)',
  onAccentSoft: '#FFFFFF',
  butter: '#F97316',
  orange: '#F97316',
  gridGreen: '#16A34A',
  gridGreenDark: '#22C55E',
  danger: '#EF4444',
  onDanger: '#FFFFFF',
  ok: '#22C55E',
  tabBar: 'rgba(8, 8, 8, 0.97)',
};

export type Mode = 'light' | 'dark';

/* ---------------------------- Font-size preference ---------------------------- */
// Body-text base size. Headings (>= 18px) stay fixed; everything below scales
// proportionally so 16 = Small, 20 = Medium, 24 = Large.
export type FontSizeOption = 16 | 20 | 24;

export const FONT_SIZE_OPTIONS: { value: FontSizeOption; label: string; hint: string }[] = [
  { value: 16, label: 'Small', hint: 'Compact 16px body' },
  { value: 20, label: 'Medium', hint: 'Comfortable 20px body' },
  { value: 24, label: 'Large', hint: 'Extra-readable 24px body' },
];

export const BASE_BODY_SIZE: FontSizeOption = 16;
/** Headings at/above this size never scale — body-text-only mode. */
export const HEADING_THRESHOLD = 18;

/* ------------------------------ Theme context ----------------------------- */
type ThemeContextValue = {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  colors: ThemeColors;
  fonts: typeof fonts;
  /** User's chosen body-text base size (16 | 20 | 24). */
  fontSize: FontSizeOption;
  setFontSize: (s: FontSizeOption) => void;
  /**
   * Scale a designed font size to the user's preference.
   * Body-text only: sizes >= HEADING_THRESHOLD are returned unchanged.
   */
  fs: (designed: number) => number;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'bawatpieza.theme.mode';
const FONT_SIZE_KEY = 'bawatpieza.theme.fontSize';

function parseFontSize(raw: string | null): FontSizeOption {
  if (raw === '20' || raw === '24') return Number(raw) as FontSizeOption;
  return 16;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('light');
  const [fontSize, setFontSizeState] = useState<FontSizeOption>(BASE_BODY_SIZE);

  // Load persisted preferences once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'dark' || saved === 'light') setModeState(saved);
      })
      .catch(() => {});
    AsyncStorage.getItem(FONT_SIZE_KEY)
      .then((saved) => setFontSizeState(parseFontSize(saved)))
      .catch(() => {});
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const setFontSize = (s: FontSizeOption) => {
    setFontSizeState(s);
    AsyncStorage.setItem(FONT_SIZE_KEY, String(s)).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode(mode === 'light' ? 'dark' : 'light'),
      colors: mode === 'dark' ? DarkTheme : LightTheme,
      fonts,
      fontSize,
      setFontSize,
      fs: (designed: number) => {
        if (designed >= HEADING_THRESHOLD) return designed;
        const scaled = (designed / BASE_BODY_SIZE) * fontSize;
        return Math.round(scaled * 100) / 100;
      },
    }),
    [mode, fontSize],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
