import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from './bottom-nav';
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
};

export function ScreenShell({
  children,
  scroll = true,
  tourScroll = false,
  contentPaddingHorizontal = 18,
  contentPaddingBottom = 110,
  title,
  showBack = false,
}: ScreenShellProps) {
  const { colors: c } = useTheme();
  const { scrollContainerRef, setScrollOffsetY } = useAppTour();

  const content = scroll ? (
    <ScrollView
      ref={(node) => {
        if (tourScroll) scrollContainerRef.current = node;
      }}
      onScroll={tourScroll ? (event) => setScrollOffsetY(event.nativeEvent.contentOffset.y) : undefined}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 150 }]}
      showsVerticalScrollIndicator={false}
    >
      {title || showBack ? <TopBar gutter={0} title={title} showBack={showBack} /> : null}
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
      {title || showBack ? <TopBar gutter={0} title={title} showBack={showBack} /> : null}
      {children}
    </View>
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
