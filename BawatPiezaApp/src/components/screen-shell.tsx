import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from './bottom-nav';
import { TopBar } from './top-bar';
import { useTheme } from '../theme';

/**
 * ScreenShell — shared authenticated screen wrapper for the mobile dashboard.
 * Renders the TopBar (greeting, active tab, notifications, profile),
 * scrollable content and the bottom navigation.
 * Theme-aware (light/dark) with Poppins typography.
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
      <TopBar />
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