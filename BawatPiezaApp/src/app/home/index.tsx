import { fonts, useTheme, type ThemeColors } from '../../theme';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ScreenShell } from '../../components/screen-shell';
import { LoadingScreen } from '../../components/loading-screen';

const statCards = [
  { label: 'Energy Today', value: '14.2 kWh', delta: '+12%', tone: 'good', icon: 'flash' },
  { label: 'Waste Converted', value: '8.6 kg', delta: '+5%', tone: 'good', icon: 'recycle' },
  { label: 'CO\u2082 Offset', value: '3.9 kg', delta: '-8%', tone: 'warn', icon: 'leaf' },
];

const energyTrend = [
  { time: '00:00', kw: 1.2 },
  { time: '04:00', kw: 0.8 },
  { time: '08:00', kw: 2.4 },
  { time: '12:00', kw: 3.8 },
  { time: '16:00', kw: 3.1 },
  { time: '20:00', kw: 2.0 },
  { time: 'Now', kw: 2.6 },
];

export default function HomeScreen() {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/');
        return;
      }
      setChecking(false);
    };
    loadSession();
  }, [router]);

  const accountStatus = useMemo(
    () => ({
      role: 'Operations Admin',
      status: 'Live',
      uptime: '99.2%',
    }),
    [],
  );

  if (checking) {
    return <LoadingScreen label="Verifying session" />;
  }

  return (
    <ScreenShell>
      <View style={styles.statusBar}>
        <View>
          <Text style={styles.statusLabel}>System status</Text>
          <Text style={styles.statusValue}>{accountStatus.status}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{accountStatus.uptime}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {statCards.map((item) => (
          <View key={item.label} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardValue}>{item.value}</Text>
                <Text style={styles.cardLabel}>{item.label}</Text>
              </View>
              <View style={[styles.iconWrap, item.tone === 'warn' && styles.warnIcon]}>
                <Ionicons name={item.icon as any} size={16} color={item.tone === 'warn' ? '#b45309' : PRUSSIAN} />
              </View>
            </View>
            <Text style={[styles.delta, item.tone === 'good' ? styles.deltaGood : styles.deltaWarn]}>
              {item.delta} vs last week
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Total output</Text>
            <View style={styles.heroNumberRow}>
              <Text style={styles.heroNumber}>124.8</Text>
              <Text style={styles.heroUnit}>kWh</Text>
            </View>
          </View>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        </View>
        <View style={styles.sparklineWrap}>
          {energyTrend.map((d) => (
            <View key={d.time} style={styles.barColumn}>
              <View style={[styles.bar, { height: (d.kw / 3.8) * 100 }]} />
              <Text style={styles.barLabel}>{d.time}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.splitRow}>
        <View style={styles.operationsCard}>
          <Text style={styles.sectionEyebrow}>Operations</Text>
          <Text style={styles.listTitle}>Active zones</Text>
          <Text style={styles.listValue}>4 / 5</Text>
          <Text style={styles.listTitle}>Uptime</Text>
          <Text style={styles.listValue}>{accountStatus.uptime}</Text>
          <View style={styles.meterRow}>
            <View style={styles.meterBarBack}>
              <View style={[styles.meterBarFill, { width: '92%' }]} />
            </View>
            <Text style={styles.meterText}>92%</Text>
          </View>
        </View>

        <View style={styles.operationsCard}>
          <Text style={styles.sectionEyebrow}>Grid flow</Text>
          <Text style={styles.listTitle}>To battery</Text>
          <Text style={styles.listValue}>3.2 kW</Text>
          <Text style={styles.listTitle}>To load</Text>
          <Text style={styles.listValue}>1.8 kW</Text>
          <View style={styles.meterRow}>
            <View style={styles.meterBarBack}>
              <View style={[styles.meterBarFill, { width: '68%' }]} />
            </View>
            <Text style={styles.meterText}>68%</Text>
          </View>
        </View>
      </View>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  return StyleSheet.create({
    statusBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: LINE,
      padding: 16,
      marginBottom: 18,
    },
    statusLabel: {
      color: MUTED,
      fontSize: 11,
      fontWeight: '700', fontFamily: fonts.bold,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    statusValue: {
      color: PRUSSIAN,
      fontSize: 18,
      fontWeight: '800', fontFamily: fonts.extrabold,
      marginTop: 4,
    },
    statusPill: {
      backgroundColor: 'rgba(246, 196, 69, 0.18)',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statusPillText: {
      color: PRUSSIAN,
      fontWeight: '800', fontFamily: fonts.extrabold,
      fontSize: 12,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 18,
    },
    card: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: LINE,
      padding: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    cardValue: {
      color: PRUSSIAN,
      fontSize: 20,
      fontWeight: '800', fontFamily: fonts.extrabold,
    },
    cardLabel: {
      color: MUTED,
      fontSize: 11,
      fontWeight: '600', fontFamily: fonts.semibold,
      marginTop: 4,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: 'rgba(10, 42, 74, 0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    warnIcon: {
      backgroundColor: 'rgba(246, 196, 69, 0.2)',
    },
    delta: {
      marginTop: 12,
      fontSize: 11,
      fontWeight: '800', fontFamily: fonts.extrabold,
    },
    deltaGood: {
      color: '#0f766e',
    },
    deltaWarn: {
      color: '#b45309',
    },
    heroCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: LINE,
      padding: 18,
      marginBottom: 18,
    },
    heroHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18,
    },
    sectionEyebrow: {
      color: MUTED,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontWeight: '800', fontFamily: fonts.extrabold,
    },
    heroNumberRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      marginTop: 8,
    },
    heroNumber: {
      color: PRUSSIAN,
      fontSize: 38,
      fontWeight: '800', fontFamily: fonts.extrabold,
      letterSpacing: -1.2,
    },
    heroUnit: {
      color: MUTED,
      fontSize: 14,
      fontWeight: '700', fontFamily: fonts.bold,
      marginBottom: 8,
    },
    liveBadge: {
      backgroundColor: 'rgba(246, 196, 69, 0.18)',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    liveBadgeText: {
      color: PRUSSIAN,
      fontWeight: '800', fontFamily: fonts.extrabold,
      fontSize: 12,
    },
    sparklineWrap: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 110,
      marginTop: 8,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      height: '100%',
      marginHorizontal: 2,
    },
    bar: {
      width: '100%',
      maxWidth: 18,
      backgroundColor: BUTTER,
      borderRadius: 10,
      minHeight: 10,
    },
    barLabel: {
      fontSize: 9,
      color: MUTED,
      marginTop: 8,
    },
    splitRow: {
      flexDirection: 'row',
      gap: 12,
    },
    operationsCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: LINE,
      padding: 16,
    },
    listTitle: {
      color: MUTED,
      fontSize: 11,
      fontWeight: '700', fontFamily: fonts.bold,
      marginTop: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    listValue: {
      color: PRUSSIAN,
      fontSize: 16,
      fontWeight: '800', fontFamily: fonts.extrabold,
      marginTop: 6,
    },
    meterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
    },
    meterBarBack: {
      flex: 1,
      height: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(10, 42, 74, 0.08)',
      overflow: 'hidden',
      marginRight: 10,
    },
    meterBarFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: PRUSSIAN,
    },
    meterText: {
      color: PRUSSIAN,
      fontSize: 12,
      fontWeight: '800', fontFamily: fonts.extrabold,
      width: 28,
      textAlign: 'right',
    },
  });
};