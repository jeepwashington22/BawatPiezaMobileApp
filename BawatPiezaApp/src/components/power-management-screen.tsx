import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenShell } from './screen-shell';
import { Card, scale } from './glass-ui';
import { fonts, useTheme, type ThemeColors } from '../theme';

type Tab = 'monitor' | 'configure' | 'allocation';

export function PowerManagementScreen() {
  const { colors: c } = useTheme();
  const [tab, setTab] = useState<Tab>('monitor');

  return (
    <ScreenShell scroll>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: c.text }]}>Power Management</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>Manage allocation</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.bell, { backgroundColor: c.surface }]}>
            <Ionicons name="notifications-outline" size={scale(18)} color={c.text} />
            <View style={[styles.notificationDot, { backgroundColor: c.orange }]} />
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>KM</Text></View>
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: c.surface }]}>
        {(['monitor', 'configure', 'allocation'] as Tab[]).map((item) => {
          const active = tab === item;
          return (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, active && styles.activeTab]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              {active && <LinearGradient colors={['#FFA51A', '#F05A16']} style={StyleSheet.absoluteFill} />}
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : c.muted }]}>{item[0].toUpperCase() + item.slice(1)}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'monitor' && <Monitor c={c} />}
      {tab === 'configure' && <Configure c={c} />}
      {tab === 'allocation' && <Allocation c={c} />}
    </ScreenShell>
  );
}

function Monitor({ c }: { c: ThemeColors }) {
  const [enabled, setEnabled] = useState(true);
  return <>
    <Card mode="light" style={styles.featureCard}>
      <View style={styles.rowBetween}>
        <View style={styles.rowTitle}><Text style={[styles.cardTitle, { color: c.text }]}>Smart Auto-Switching</Text><Text style={{ color: c.muted }}>›</Text></View>
        <Pressable onPress={() => setEnabled(!enabled)} style={[styles.toggle, { backgroundColor: enabled ? '#0A56AD' : c.line }]}><View style={[styles.toggleKnob, !enabled && styles.toggleOff]} /></Pressable>
      </View>
      <Text style={[styles.cardCopy, { color: c.muted }]}>Toggles grid ↔ battery capacity &amp; load · tap for{`\n`}details</Text>
    </Card>
    <SectionLabel label="BATTERY BANKS" action="Tap a bank for detail" c={c} />
    <View style={styles.bankRow}><BankCard name="BANK A" value="100%" status="Full — charging stopped" tone="good" c={c} /><BankCard name="BANK B" value="62%" status="Charging" tone="fair" c={c} /></View>
    <View style={[styles.notice, { backgroundColor: '#F5F0EA' }]}><Text style={[styles.noticeTitle, { color: c.orange }]}>Bank A reached 100%</Text><Text style={[styles.noticeCopy, { color: c.muted }]}>Charging stopped automatically to prevent overcharge. Notification{`\n`}sent to Admin &amp; Maintenance.</Text></View>
    <SectionLabel label="CURRENTLY DISCHARGING" action="Change in Overrides" c={c} />
    <Card mode="light" style={styles.discharge}><View><Text style={[styles.cardTitle, { color: c.text }]}>Bank A is supplying the campus</Text><Text style={[styles.cardCopy, { color: c.muted }]}>Following Smart Auto-Switching — tap to override manually</Text></View><Text style={{ color: c.muted }}>⌄</Text></Card>
  </>;
}

function Configure({ c }: { c: ThemeColors }) {
  return <>
    <SectionLabel label="BATTERY ALERT THRESHOLDS" c={c} />
    <View style={styles.bankRow}><ThresholdCard name="BANK A" c={c} /><ThresholdCard name="BANK B" c={c} /></View>
    <SectionLabel label="TIME-OF-USE SCHEDULER" c={c} />
    <Card mode="light" style={styles.scheduler}><ScheduleRow title="Peak Hours" note="Use battery power" time="7:00 AM - 7:00 PM" c={c} /><ScheduleRow title="Off-Peak Hours" note="Draw from grid" time="8:00 PM - 6:00 AM" c={c} /><Pressable style={styles.scheduleLink}><Text style={[styles.smallBold, { color: c.text }]}>How this schedule is set?⌄</Text></Pressable><ActionButton label="Check a zone's runtime need against this window →" /></Card>
  </>;
}

function Allocation({ c }: { c: ThemeColors }) {
  const [zone, setZone] = useState('1F');
  return <>
    <View style={styles.infoBand}><Text style={[styles.noticeTitle, { color: c.orange }]}>Campus-wide power allocation</Text><Text style={[styles.cardCopy, { color: c.muted }]}>Assign each battery-powered zone its hours and start time — nothing changes on campus until you confirm.</Text></View>
    <SectionLabel label="AVAILABLE BATTERY POOL" c={c} />
    <Card mode="light" style={styles.pool}><View style={styles.rowBetween}><View><Text style={[styles.smallBold, { color: c.muted }]}>BANK A + BANK B</Text><Text style={[styles.poolNote, { color: c.muted }]}>Bank A is 100% full{`\n`}Bank B is 62% full</Text></View><Text style={[styles.poolValue, { color: c.text }]}>~9.2h{`\n`}stored</Text></View><View style={styles.progress}><View style={styles.progressFill} /></View><View style={styles.progressLabels}><Text style={styles.progressText}>0% assigned so far</Text><Text style={styles.progressText}>100% still free</Text></View><ActionButton label="Let System Allocate" /><Text style={[styles.cardCopy, { color: c.muted }]}>Gives the most important rooms their full hours first, then splits what's left. Tap +/- or the start time on any room to set it yourself.</Text></Card>
    <SectionLabel label="ALL ZONES" c={c} /><View style={styles.zoneRow}>{['1F', '2F', '3F', '4F'].map((item) => <Pressable key={item} onPress={() => setZone(item)} style={[styles.zonePill, { backgroundColor: zone === item ? '#0A56AD' : c.surface }]}><Text style={[styles.zoneText, { color: zone === item ? '#FFFFFF' : c.muted }]}>{item}</Text></Pressable>)}</View><ZoneCard c={c} />
  </>;
}

function SectionLabel({ label, action, c }: { label: string; action?: string; c: ThemeColors }) { return <View style={styles.sectionLabel}><Text style={[styles.sectionText, { color: c.muted }]}>{label}</Text>{action && <Text style={[styles.sectionAction, { color: c.muted }]}>{action}</Text>}</View>; }
function BankCard({ name, value, status, tone, c }: { name: string; value: string; status: string; tone: 'good' | 'fair'; c: ThemeColors }) { return <Card mode="light" style={styles.bankCard}><View style={styles.rowBetween}><Text style={[styles.smallBold, { color: c.muted }]}>{name}</Text><Text style={[styles.statusPill, { backgroundColor: tone === 'good' ? '#E4F1FF' : '#FFF2D8', color: tone === 'good' ? '#2670B5' : '#C17D17' }]}>{tone === 'good' ? 'Good' : 'Fair'}</Text></View><Text style={[styles.bankValue, { color: c.text }]}>{value}</Text><Text style={[styles.bankStatus, { color: tone === 'good' ? c.orange : c.muted }]}>{status}</Text></Card>; }
function ThresholdCard({ name, c }: { name: string; c: ThemeColors }) { return <Card mode="light" style={styles.threshold}><Text style={[styles.smallBold, { color: c.muted }]}>{name}</Text><View style={styles.thresholdRow}><Text style={[styles.cardCopy, { color: c.muted }]}>Alert below</Text><Text style={[styles.thresholdValue, { color: c.orange }]}>25%</Text></View></Card>; }
function ScheduleRow({ title, note, time, c }: { title: string; note: string; time: string; c: ThemeColors }) { return <View style={styles.scheduleRow}><View><Text style={[styles.smallBold, { color: c.text }]}>{title}</Text><Text style={[styles.cardCopy, { color: c.muted }]}>{note}</Text></View><Text style={[styles.scheduleTime, { color: c.orange }]}>{time}</Text></View>; }
function ActionButton({ label }: { label: string }) { return <Pressable style={styles.actionButton}><LinearGradient colors={['#FFA51A', '#F05A16']} style={StyleSheet.absoluteFill} /><Text style={styles.actionText}>{label}</Text></Pressable>; }
function ZoneCard({ c }: { c: ThemeColors }) { return <Card mode="light" style={styles.zoneCard}><Text style={[styles.smallBold, { color: c.text }]}>1F ROOM 109 - RIGHT WING</Text><View style={styles.chips}><Text style={styles.priority}>High priority</Text><Text style={styles.batteryChip}>Battery</Text></View><Text style={[styles.cardCopy, { color: c.muted }]}>wants to run 12h/day · Mon-Fri · 6:00 PM-6:00 AM</Text></Card>; }

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(8), paddingBottom: scale(18) },
  title: { fontSize: scale(21), fontFamily: fonts.extrabold, letterSpacing: -0.5 }, subtitle: { fontSize: scale(12), fontFamily: fonts.medium, marginTop: scale(1) }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: scale(10) }, bell: { width: scale(40), height: scale(40), borderRadius: scale(20), alignItems: 'center', justifyContent: 'center' }, notificationDot: { width: scale(5), height: scale(5), borderRadius: scale(3), position: 'absolute', top: scale(8), right: scale(9) }, avatar: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: '#0A56AD', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontFamily: fonts.bold, fontSize: scale(12) },
  tabs: { flexDirection: 'row', padding: scale(5), marginBottom: scale(12) }, tab: { flex: 1, minHeight: scale(43), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, activeTab: { borderRadius: scale(10) }, tabText: { fontFamily: fonts.bold, fontSize: scale(11) }, featureCard: { padding: scale(14), marginBottom: scale(14) }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowTitle: { flexDirection: 'row', gap: scale(7), alignItems: 'center' }, cardTitle: { fontSize: scale(12), fontFamily: fonts.bold }, cardCopy: { fontSize: scale(9.5), fontFamily: fonts.medium, lineHeight: scale(13) }, toggle: { width: scale(36), height: scale(21), borderRadius: scale(12), padding: scale(3), justifyContent: 'center' }, toggleKnob: { width: scale(15), height: scale(15), borderRadius: scale(8), backgroundColor: '#FFF', alignSelf: 'flex-end' }, toggleOff: { alignSelf: 'flex-start' },
  sectionLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: scale(2), marginTop: scale(4), marginBottom: scale(7) }, sectionText: { fontSize: scale(10), fontFamily: fonts.extrabold, letterSpacing: 1.1 }, sectionAction: { fontSize: scale(9), fontFamily: fonts.bold }, bankRow: { flexDirection: 'row', gap: scale(9), marginBottom: scale(8) }, bankCard: { flex: 1, padding: scale(12), minHeight: scale(81) }, smallBold: { fontSize: scale(10), fontFamily: fonts.bold }, statusPill: { fontSize: scale(8), fontFamily: fonts.bold, paddingHorizontal: scale(7), paddingVertical: scale(3), borderRadius: scale(10) }, bankValue: { fontSize: scale(20), fontFamily: fonts.extrabold, marginTop: scale(3) }, bankStatus: { fontSize: scale(9), fontFamily: fonts.bold }, notice: { borderRadius: scale(17), padding: scale(13), marginBottom: scale(12) }, noticeTitle: { fontSize: scale(10), fontFamily: fonts.bold }, noticeCopy: { fontSize: scale(9), fontFamily: fonts.medium, lineHeight: scale(12) }, discharge: { padding: scale(14), flexDirection: 'row', justifyContent: 'space-between', marginBottom: scale(18) },
  threshold: { flex: 1, padding: scale(18), minHeight: scale(79) }, thresholdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: scale(18) }, thresholdValue: { fontSize: scale(18), fontFamily: fonts.extrabold }, scheduler: { padding: scale(16), marginBottom: scale(20) }, scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: scale(12), borderBottomWidth: 1, borderBottomColor: 'rgba(10,42,74,0.1)' }, scheduleTime: { fontSize: scale(11), fontFamily: fonts.extrabold, alignSelf: 'center' }, scheduleLink: { paddingVertical: scale(10), borderBottomWidth: 1, borderBottomColor: 'rgba(10,42,74,0.1)' }, actionButton: { minHeight: scale(42), borderRadius: scale(13), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: scale(16) }, actionText: { color: '#FFF', fontSize: scale(10), fontFamily: fonts.bold, textAlign: 'center' },
  infoBand: { borderRadius: scale(17), padding: scale(14), marginBottom: scale(15), backgroundColor: '#F2EEE8' }, pool: { padding: scale(16), marginBottom: scale(17) }, poolNote: { fontSize: scale(9), fontFamily: fonts.medium, lineHeight: scale(12), marginTop: scale(3) }, poolValue: { fontSize: scale(19), lineHeight: scale(21), fontFamily: fonts.extrabold, textAlign: 'right' }, progress: { height: scale(10), backgroundColor: '#A7ABC4', borderRadius: scale(5), marginTop: scale(14), overflow: 'hidden' }, progressFill: { width: '0%', height: '100%', backgroundColor: '#F97316' }, progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: scale(5) }, progressText: { color: '#68729A', fontSize: scale(7), fontFamily: fonts.bold }, zoneRow: { flexDirection: 'row', gap: scale(9), marginBottom: scale(16) }, zonePill: { width: scale(49), height: scale(42), borderRadius: scale(23), alignItems: 'center', justifyContent: 'center' }, zoneText: { fontSize: scale(11), fontFamily: fonts.bold }, zoneCard: { padding: scale(16), marginBottom: scale(20) }, chips: { flexDirection: 'row', gap: scale(6), marginVertical: scale(6) }, priority: { color: '#F05A16', backgroundColor: '#FFF0E4', paddingHorizontal: scale(7), paddingVertical: scale(3), borderRadius: scale(8), fontSize: scale(8), fontFamily: fonts.bold }, batteryChip: { color: '#68729A', backgroundColor: '#EEF0F7', paddingHorizontal: scale(7), paddingVertical: scale(3), borderRadius: scale(8), fontSize: scale(8), fontFamily: fonts.bold },
});
