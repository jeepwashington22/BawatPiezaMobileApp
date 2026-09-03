import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { BottomNav } from './bottom-nav';

/**
 * ScreenShell — shared authenticated screen wrapper for the mobile dashboard.
 * Renders a styled header (title + logout), scrollable content and the web-style
 * bottom navigation. Mirrors the web dashboard layout for a consistent shell.
 */

const PRUSSIAN = '#0A2A4A';
const BUTTER = '#F6C445';
const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.12)';

export type ScreenShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
};

export function ScreenShell({ title, subtitle, children, scroll = true }: ScreenShellProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flexContent}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>BawatPieza</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          style={styles.iconButton}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Ionicons name="log-out-outline" size={20} color={PRUSSIAN} />
        </Pressable>
      </View>

      {content}

      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  eyebrow: {
    color: BUTTER,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 2,
  },
  title: {
    color: PRUSSIAN,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 110,
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 110,
  },
});