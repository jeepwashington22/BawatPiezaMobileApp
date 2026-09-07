import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { BottomNav } from './bottom-nav';
import { useTheme } from '../theme';

/**
 * ScreenShell — shared authenticated screen wrapper for the mobile dashboard.
 * Renders scrollable content over a premium ambient background with the
 * bottom navigation. Top navigation was removed as redundant (bottom nav +
 * in-page headers cover it).
 */
export type ScreenShellProps = {
  children: ReactNode;
  scroll?: boolean;
};

export function ScreenShell({ children, scroll = true }: ScreenShellProps) {
  const { mode } = useTheme();

  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexContent, { paddingBottom: 110 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ambient navy → gold-tinged background behind every page */}
      <LinearGradient
        colors={
          mode === 'dark'
            ? ['#0B1220', '#0E1B30', '#12233F']
            : ['#F2F4F7', '#EDF1F6', '#E8EDF5']
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowWrap}>
        <View style={[styles.glow, { backgroundColor: mode === 'dark' ? 'rgba(246,196,69,0.06)' : 'rgba(246,196,69,0.12)' }]} />
      </View>
      {content}
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  glowWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  scrollContent: {
    paddingHorizontal: 18,
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: 18,
  },
});