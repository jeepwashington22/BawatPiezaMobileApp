import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from './bottom-nav';
import { useTheme } from '../theme';

/**
 * ScreenShell — shared authenticated screen wrapper for the mobile dashboard.
 * Renders scrollable content over a plain, solid background colour (`bg`) with
 * the bottom navigation.
 *
 * The canvas is intentionally flat: no gradient wash and no ambient glow blob.
 * Dark mode is a strict black-and-white theme, so the background is pure black
 * and nothing tints it.
 */
export type ScreenShellProps = {
  children: ReactNode;
  scroll?: boolean;
};

export function ScreenShell({ children, scroll = true }: ScreenShellProps) {
  const { colors: c } = useTheme();

  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexContent, { paddingBottom: 110 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      {content}
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: 18,
  },
});
