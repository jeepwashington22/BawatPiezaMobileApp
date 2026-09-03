import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { BottomNav } from '../../components/bottom-nav';
import { LoadingScreen } from '../../components/loading-screen';

const PRUSSIAN = '#0A2A4A';
const PRUSSIAN_SOFT = '#3B5B7A';
const BUTTER = '#F6C445';
const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.12)';

const statCards = [
  { label: 'Energy Today', value: '14.2 kWh', delta: '+12%', tone: 'good', icon: 'flash' },
  { label: 'Waste Converted', value: '8.6 kg', delta: '+5%', tone: 'good', icon: 'recycle' },
  { label: 'CO₂ Offset', value: '3.9 kg', delta: '-8%', tone: 'warn', icon: 'leaf' },
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (checking) {
    return <LoadingScreen label="Verifying session" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.muted}>Good evening</Text>
            <Text style={styles.title}>
              Bawat<Text style={styles.titleAccent}>Pieza</Text>
            </Text>
          </View>

          <Pressable style={styles.iconButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={PRUSSIAN} />
          </Pressable>
        </View>

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
                  <Ionicons name={item.icon as any} size={18} color={item.tone === 'warn' ? '#7c3d00' : PRUSSIAN} />
                </View>
              </View>
              <Text style={[styles.delta, item.tone === 'warn' ? styles.deltaWarn : styles.deltaGood]}>{item.delta} vs yesterday</Text>
            </View>
          ))}
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Live consumption</Text>
              <View style={styles.heroNumberRow}>
                <Text style={styles.heroNumber}>2.6</Text>
                <Text style={styles.heroUnit}>kW</Text>
              </View>
            </View>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>Efficient</Text>
            </View>
          </View>

          <View style={styles.sparklineWrap}>
            {energyTrend.map((point, index) => {
              const max = 4;
              const height = (point.kw / max) * 100;
              return (
                <View key={`${point.time}-${index}`} style={styles.barColumn}>
                  <View style={[styles.bar, { height: `${height}%` }]} />
                  <Text style={styles.barLabel}>{point.time}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.splitRow}>
          <View style={styles.operationsCard}>
            <Text style={styles.sectionEyebrow}>Operations</Text>
            <Text style={styles.listTitle}>Current role</Text>
            <Text style={styles.listValue}>{accountStatus.role}</Text>
            <Text style={styles.listTitle}>Priority</Text>
            <Text style={styles.listValue}>Energy harvest</Text>
          </View>

          <View style={styles.operationsCard}>
            <Text style={styles.sectionEyebrow}>Energy mix</Text>
            <View style={styles.meterRow}>
              <View style={styles.meterBarBack}>
                <View style={[styles.meterBarFill, { width: '46%' }]} />
              </View>
              <Text style={styles.meterText}>46%</Text>
            </View>
            <View style={styles.meterRow}>
              <View style={styles.meterBarBack}>
                <View style={[styles.meterBarFill, { width: '32%', backgroundColor: BUTTER }]} />
              </View>
              <Text style={styles.meterText}>32%</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 110,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  muted: {
    color: MUTED,
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: {
    color: PRUSSIAN,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  titleAccent: {
    color: BUTTER,
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
  statusBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  statusLabel: {
    color: MUTED,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  statusValue: {
    color: PRUSSIAN,
    fontSize: 18,
    fontWeight: '800',
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
    fontWeight: '800',
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  card: {
    width: '31.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardValue: {
    color: PRUSSIAN,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
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
    fontWeight: '800',
  },
  deltaGood: {
    color: '#0f766e',
  },
  deltaWarn: {
    color: '#b45309',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
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
    fontWeight: '800',
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
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  heroUnit: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '800',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    padding: 16,
  },
  listTitle: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listValue: {
    color: PRUSSIAN,
    fontSize: 16,
    fontWeight: '800',
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
    fontWeight: '800',
    width: 28,
    textAlign: 'right',
  },
});
