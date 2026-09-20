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
  danger: '#DC2626',
  onDanger: '#FFFFFF',
  ok: '#15803D',
  tabBar: 'rgba(255, 255, 255, 0.97)',
};

/**
 * Dark mode is a strict black-and-white theme.
 *
 * There is deliberately no navy, no gold and no semantic hue here: the canvas
 * is pure black, surfaces are near-black, type is white and every accent is
 * white. Emphasis comes from contrast, border weight and type weight instead of
 * colour, which is why `danger` / `ok` / `orange` are neutral too — destructive
 * and live states are marked by copy and iconography, not by red/green.
 */
export const DarkTheme: ThemeColors = {
  bg: '#000000',
  surface: '#0E0E0E',
  surfaceMuted: '#161616',
  line: 'rgba(255, 255, 255, 0.16)',
  text: '#FFFFFF',
  textSoft: 'rgba(255, 255, 255, 0.80)',
  muted: 'rgba(255, 255, 255, 0.52)',
  accent: '#FFFFFF', // white-on-black is the action colour in a B/W theme
  onAccent: '#000000',
  accentSoft: 'rgba(255, 255, 255, 0.12)',
  onAccentSoft: '#FFFFFF',
  butter: '#FFFFFF',
  orange: '#E5E5E5',
  danger: '#FFFFFF',
  onDanger: '#000000',
  ok: '#FFFFFF',
  tabBar: 'rgba(8, 8, 8, 0.97)',
};

export type Mode = 'light' | 'dark';

/* ------------------------------ Theme context ----------------------------- */
type ThemeContextValue = {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  colors: ThemeColors;
  fonts: typeof fonts;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'bawatpieza.theme.mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('light');

  // Load persisted preference once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'dark' || saved === 'light') setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode(mode === 'light' ? 'dark' : 'light'),
      colors: mode === 'dark' ? DarkTheme : LightTheme,
      fonts,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
