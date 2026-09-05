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

export const DarkTheme: ThemeColors = {
  bg: '#0B1220',
  surface: '#141E32',
  surfaceMuted: '#1B2740',
  line: 'rgba(232, 238, 246, 0.14)',
  text: '#EDF2FA',
  textSoft: 'rgba(237, 242, 250, 0.82)',
  muted: 'rgba(237, 242, 250, 0.60)',
  accent: '#F6C445', // butter pops on dark; prussian would vanish
  onAccent: '#0B1220',
  accentSoft: 'rgba(246, 196, 69, 0.16)',
  onAccentSoft: '#F6C445',
  butter: '#F6C445',
  orange: '#FB923C',
  danger: '#F87171',
  onDanger: '#0B1220',
  ok: '#4ADE80',
  tabBar: 'rgba(15, 23, 38, 0.97)',
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
