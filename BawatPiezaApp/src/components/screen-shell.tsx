import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from './bottom-nav';
import { NoDeviceNotice, useDeviceConnection } from './device-status-banner';
import { TopBar } from './top-bar';
import { useTheme } from '../theme';
import { useAppTour } from '../hooks/use-app-tour';

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
  tourScroll?: boolean;
  contentPaddingHorizontal?: number;
  contentPaddingBottom?: number;
  title?: string;
  showBack?: boolean;
  header?: ReactNode;
  showNoDeviceNotice?: boolean;
};

export function ScreenShell({
  children,
  scroll = true,
  tourScroll = false,
  contentPaddingHorizontal = 18,
  contentPaddingBottom = 110,
  title,
  showBack = false,
  header,
  showNoDeviceNotice = false,
}: ScreenShellProps) {
  const { colors: c } = useTheme();
  const { scrollContainerRef, setScrollOffsetY } = useAppTour();
  const hasDevice = useDeviceConnection();
  const showEmptyState = showNoDeviceNotice && hasDevice === false;
  const checkingDeviceAccess = showNoDeviceNotice && hasDevice === null;
  const pageHeader =
    title || showBack ? <TopBar gutter={0} title={title} showBack={showBack} /> : null;

  const content = checkingDeviceAccess ? (
    <View style={styles.emptyStateContent}>
      <ActivityIndicator color={c.orange} />
    </View>
  ) : showEmptyState ? (
    <View style={styles.emptyStateContent}>
      <NoDeviceNotice hasDevice={hasDevice} />
    </View>
  ) : scroll ? (
    <ScrollView
      ref={(node) => {
        if (tourScroll) scrollContainerRef.current = node;
      }}
      onScroll={tourScroll ? (event) => setScrollOffsetY(event.nativeEvent.contentOffset.y) : undefined}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 150 }]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flexContent,
        {
          paddingBottom: contentPaddingBottom,
          paddingHorizontal: contentPaddingHorizontal,
        },
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      {header ?? (pageHeader ? <View style={styles.fixedHeader}>{pageHeader}</View> : null)}
      {content}
      <BottomNav hasDevice={hasDevice} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  fixedHeader: {
    paddingHorizontal: 18,
  },
  scrollContent: {
    paddingHorizontal: 18,
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: 18,
  },
  emptyStateContent: {
    flex: 1,
    paddingHorizontal: 18,
  },
});
