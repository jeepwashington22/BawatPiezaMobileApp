import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenShell } from './screen-shell';
import { Card, scale } from './glass-ui';
import { fonts, useTheme, type Mode, type ThemeColors } from '../theme';

type Tab = 'monitor' | 'configure' | 'allocation';

export function PowerManagementScreen() {
  const { colors: c, mode } = useTheme();
  const [tab, setTab] = useState<Tab>('monitor');

  return (
    <ScreenShell scroll title="Power Management">
      <View style={[styles.tabs, { backgroundColor: c.surface }]}>
        {(['monitor', 'configure', 'allocation'] as Tab[]).map((item) => {
          const active = tab === item;

          return (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              style={[styles.tab, active && styles.activeTab]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {active && <LinearGradient colors={['#F9A84E', '#F59E0B']} style={StyleSheet.absoluteFill} />}
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : c.muted }]}>
                {item[0].toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'monitor' && <Monitor c={c} mode={mode} />}
      {tab === 'configure' && <Configure c={c} mode={mode} />}
      {tab === 'allocation' && <Allocation c={c} mode={mode} />}
    </ScreenShell>
  );
}

function Monitor({ c, mode }: { c: ThemeColors; mode: Mode }) {
  const [enabled, setEnabled] = useState(true);

  return (
    <>
      <Card mode={mode} style={styles.featureCard}>
        <View style={styles.rowBetween}>
          <View style={styles.rowTitle}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Smart Auto-Switching</Text>
            <Ionicons name="chevron-forward" size={scale(16)} color={c.muted} />
          </View>

          <Pressable
            onPress={() => setEnabled(!enabled)}
            style={[styles.toggle, { backgroundColor: enabled ? '#0A56AD' : '#D9E2EC' }]}
          >
            <View style={[styles.toggleKnob, !enabled && styles.toggleOff]} />
          </Pressable>
        </View>

        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Toggles grid ↔ battery capacity &amp; load · tap for details
        </Text>
      </Card>

      <SectionLabel label="BATTERY BANKS" action="Tap a bank for detail" c={c} />

      <View style={styles.bankStack}>
        <BankCard name="BANK A" value="100%" status="Full — charging stopped" tone="good" c={c} />
        <BankCard name="BANK B" value="62%" status="Charging" tone="fair" c={c} />
      </View>

      <View style={[styles.notice, { backgroundColor: mode === 'dark' ? '#17120D' : '#F4F0E9', borderColor: mode === 'dark' ? 'rgba(251,146,60,0.25)' : 'transparent' }]}>
        <Text style={[styles.noticeTitle, { color: c.orange }]}>Bank A reached 100%</Text>
        <Text style={[styles.noticeCopy, { color: c.muted }]}>Charging stopped automatically to prevent overcharge. Notification sent to Admin &amp; Maintenance.</Text>
      </View>

      <SectionLabel label="CURRENTLY DISCHARGING" action="Change in Overrides" c={c} />

      <Card mode={mode} style={styles.dischargeCard}>
        <View style={styles.dischargeTextWrap}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Bank A is supplying the campus</Text>
          <Text style={[styles.cardCopy, { color: c.muted }]}>Following Smart Auto-Switching — tap to override manually</Text>
        </View>
        <Ionicons name="chevron-down" size={scale(18)} color={c.muted} />
      </Card>
    </>
  );
}

function Configure({ c, mode }: { c: ThemeColors; mode: Mode }) {
  return (
    <>
      <View style={styles.bankStack}>
        <ThresholdCard name="BANK A" c={c} />
        <ThresholdCard name="BANK B" c={c} />
      </View>

      <SectionLabel label="TIME-OF-USE SCHEDULER" c={c} />

      <Card mode={mode} style={styles.schedulerCard}>
        <ScheduleRow title="Peak Hours" note="Use battery power" time="7:00 AM - 7:00 PM" c={c} mode={mode} />
        <ScheduleRow title="Off-Peak Hours" note="Draw from grid" time="8:00 PM - 6:00 AM" c={c} mode={mode} />

        <Pressable style={[styles.scheduleLink, { borderBottomColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(10,42,74,0.1)' }]}>
          <Text style={[styles.smallBold, { color: c.text }]}>How this schedule is set? </Text>
          <Ionicons name="chevron-down" size={scale(13)} color={c.text} />
        </Pressable>

        <ActionButton label="Check a zone's runtime need against this window →" />
      </Card>
    </>
  );
}

function Allocation({ c, mode }: { c: ThemeColors; mode: Mode }) {
  const [zone, setZone] = useState('1F');

  return (
    <>
      <View style={[styles.poolCard, { backgroundColor: mode === 'dark' ? '#111820' : '#0A2A4A', borderColor: mode === 'dark' ? 'rgba(147,197,253,0.24)' : 'transparent' }]}>
        <View style={styles.rowBetween}>
          <View>
            <View style={styles.poolHeading}><View style={styles.poolIcon}><Ionicons name="layers-outline" size={scale(20)} color="#FFFFFF" /></View><View><Text style={styles.poolTitle}>Available battery pool</Text><Text style={styles.poolSubtitle}>BANK A + BANK B</Text></View></View>
            <Text style={[styles.poolNote, { color: c.muted }]}>Bank A is 100% full{'\n'}Bank B is 62% full</Text>
          </View>

          <Text style={[styles.poolValue, { color: c.text }]}>~9.2h{'\n'}stored</Text>
        </View>

        <View style={styles.progress}>
          <View style={styles.progressFill} />
        </View>

        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>0% assigned so far</Text>
          <Text style={styles.progressText}>100% still free</Text>
        </View>

        <ActionButton label="Let System Allocate" />

        <Text style={[styles.cardCopy, { color: c.muted, marginTop: scale(12) }]}>
          Gives the most important rooms their full hours first, then splits what&apos;s left. Tap +/- or the start time on any room to set it yourself.
        </Text>
      </View>

      <View style={[styles.infoBand, { backgroundColor: mode === 'dark' ? '#17120D' : '#F4EFE8', borderColor: mode === 'dark' ? 'rgba(251,146,60,0.22)' : 'transparent' }]}>
        <Text style={[styles.noticeTitle, { color: c.orange }]}>Campus-wide power allocation</Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>Assign each battery-powered zone its hours and start time — nothing changes on campus until you confirm.</Text>
      </View>

      <SectionLabel label="ALL ZONES" c={c} />

      <View style={styles.zoneRow}>
        {['1F', '2F', '3F', '4F'].map((item) => {
          const active = zone === item;
          return (
            <Pressable
              key={item}
              onPress={() => setZone(item)}
              style={[styles.zonePill, { backgroundColor: active ? '#0A56AD' : c.surface, borderColor: mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'transparent' }]}
            >
              <Text style={[styles.zoneText, { color: active ? '#FFFFFF' : c.muted }]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>

      <ZoneCard c={c} mode={mode} />
    </>
  );
}

function SectionLabel({ label, action, c }: { label: string; action?: string; c: ThemeColors }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={[styles.sectionText, { color: c.muted }]}>{label}</Text>
      {action ? <Text style={[styles.sectionAction, { color: c.muted }]}>{action}</Text> : null}
    </View>
  );
}

function BankCard({
  name,
  value,
  status,
  tone,
  c,
}: {
  name: string;
  value: string;
  status: string;
  tone: 'good' | 'fair';
  c: ThemeColors;
}) {
  return (
    <View style={[styles.bankCard, { backgroundColor: tone === 'good' ? '#0B63B7' : '#F97316' }]}>
      <View style={styles.bankCardTop}>
        <View style={styles.bankIcon}><Ionicons name={tone === 'good' ? 'battery-full' : 'battery-charging'} size={scale(20)} color="#FFFFFF" /></View>
        <Text style={styles.bankName}>{name}</Text>
        <Text style={[styles.statusPill, { backgroundColor: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }]}>{tone === 'good' ? 'Good' : 'Fair'}</Text>
      </View>
      <View style={styles.bankCardBottom}>
        <Text style={styles.bankValue}>{value}</Text>
        <Text style={styles.bankStatus}>{status}</Text>
      </View>
    </View>
  );
}

function ThresholdCard({ name, c }: { name: string; c: ThemeColors }) {
  return (
    <View style={[styles.thresholdCard, { backgroundColor: name === 'BANK A' ? '#0B63B7' : '#F97316' }]}>
      <View style={styles.thresholdHeader}><View style={styles.thresholdIcon}><Ionicons name={name === 'BANK A' ? 'battery-full-outline' : 'battery-half-outline'} size={scale(19)} color="#FFFFFF" /></View><Text style={styles.thresholdName}>{name}</Text><Text style={styles.thresholdBadge}>ALERT</Text></View>
      <View style={styles.thresholdRow}>
        <Text style={styles.thresholdCopy}>Alert below</Text>
        <Text style={styles.thresholdValue}>25%</Text>
      </View>
    </View>
  );
}

function ScheduleRow({ title, note, time, c, mode }: { title: string; note: string; time: string; c: ThemeColors; mode: Mode }) {
  return (
    <View style={[styles.scheduleRow, { borderBottomColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(10,42,74,0.1)' }]}>
      <View>
        <Text style={[styles.smallBold, { color: c.text }]}>{title}</Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>{note}</Text>
      </View>
      <Text style={[styles.scheduleTime, { color: c.orange }]}>{time}</Text>
    </View>
  );
}

function ActionButton({ label }: { label: string }) {
  return (
    <Pressable style={styles.actionButton}>
      <LinearGradient colors={['#F8A742', '#F05A16']} style={StyleSheet.absoluteFill} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function ZoneCard({ c, mode }: { c: ThemeColors; mode: Mode }) {
  return (
    <Card mode={mode} style={styles.zoneCard}>
      <Text style={[styles.zoneHeader, { color: c.text }]}>1F ROOM 109 - RIGHT WING</Text>

      <View style={styles.chips}>
        <Text style={styles.priority}>High priority</Text>
        <Text style={styles.batteryChip}>Battery</Text>
      </View>

      <Text style={[styles.cardCopy, { color: c.muted }]}>wants to run 12h/day · Mon-Fri · 6:00 PM-6:00 AM</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: scale(8),
    paddingBottom: scale(18),
  },
  title: {
    fontSize: scale(27),
    fontFamily: fonts.extrabold,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: scale(12),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  tabs: {
    flexDirection: 'row',
    padding: scale(3),
    borderRadius: scale(12),
    marginBottom: scale(16),
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    minHeight: scale(34),
    borderRadius: scale(9),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeTab: {
    borderRadius: scale(9),
    overflow: 'hidden',
  },
  tabText: {
    fontSize: scale(9.5),
    fontFamily: fonts.bold,
  },
  featureCard: {
    padding: scale(14),
    marginBottom: scale(14),
    borderRadius: scale(18),
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  cardTitle: {
    fontSize: scale(12),
    fontFamily: fonts.bold,
  },
  cardCopy: {
    fontSize: scale(9.5),
    fontFamily: fonts.medium,
    lineHeight: scale(13),
    marginTop: scale(6),
  },
  toggle: {
    width: scale(38),
    height: scale(22),
    borderRadius: scale(12),
    padding: scale(3),
    justifyContent: 'center',
  },
  toggleKnob: {
    width: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-end',
  },
  toggleOff: {
    alignSelf: 'flex-start',
  },
  sectionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: scale(2),
    marginTop: scale(4),
    marginBottom: scale(8),
  },
  sectionText: {
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
    letterSpacing: 1.1,
  },
  sectionAction: {
    fontSize: scale(8.5),
    fontFamily: fonts.bold,
  },
  bankRow: {
    flexDirection: 'row',
    gap: scale(9),
    marginBottom: scale(10),
  },
  bankStack: {
    gap: scale(10),
    marginBottom: scale(12),
  },
  bankCard: {
    width: '100%',
    minHeight: scale(112),
    borderRadius: scale(18),
    padding: scale(15),
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.16,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  bankCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
  },
  bankIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  bankName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: scale(10),
    letterSpacing: 1.2,
    fontFamily: fonts.extrabold,
  },
  bankCardBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: scale(10),
  },
  smallBold: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  statusPill: {
    fontSize: scale(8),
    fontFamily: fonts.bold,
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(9),
    overflow: 'hidden',
  },
  bankValue: {
    color: '#FFFFFF',
    fontSize: scale(28),
    fontFamily: fonts.extrabold,
  },
  bankStatus: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: scale(9),
    fontFamily: fonts.bold,
  },
  notice: {
    borderRadius: scale(16),
    padding: scale(12),
    marginBottom: scale(12),
  },
  noticeTitle: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  noticeCopy: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    lineHeight: scale(12),
    marginTop: scale(4),
  },
  dischargeCard: {
    padding: scale(14),
    marginBottom: scale(18),
    borderRadius: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dischargeTextWrap: {
    flex: 1,
    paddingRight: scale(10),
  },
  thresholdCard: {
    width: '100%',
    padding: scale(15),
    minHeight: scale(96),
    borderRadius: scale(17),
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.14,
    shadowRadius: scale(9),
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  thresholdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
  },
  thresholdIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  thresholdName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: scale(10),
    letterSpacing: 1.1,
    fontFamily: fonts.extrabold,
  },
  thresholdBadge: {
    color: '#FFFFFF',
    fontSize: scale(7),
    letterSpacing: 0.8,
    paddingHorizontal: scale(7),
    paddingVertical: scale(4),
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.18)',
    fontFamily: fonts.extrabold,
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: scale(18),
  },
  thresholdValue: {
    color: '#FFFFFF',
    fontSize: scale(20),
    fontFamily: fonts.extrabold,
  },
  thresholdCopy: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: scale(9),
    fontFamily: fonts.medium,
  },
  schedulerCard: {
    padding: scale(16),
    borderRadius: scale(18),
    marginBottom: scale(20),
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  scheduleTime: {
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
    alignSelf: 'center',
  },
  scheduleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(2),
    paddingVertical: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  actionButton: {
    minHeight: scale(44),
    borderRadius: scale(14),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: scale(16),
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: scale(10),
    fontFamily: fonts.bold,
    paddingHorizontal: scale(16),
    textAlign: 'center',
  },
  infoBand: {
    borderRadius: scale(18),
    padding: scale(14),
    marginBottom: scale(14),
    backgroundColor: '#F4EFE8',
    borderWidth: 1,
  },
  poolCard: {
    padding: scale(15),
    borderRadius: scale(18),
    marginBottom: scale(18),
    backgroundColor: '#0A2A4A',
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.18,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    borderWidth: 1,
  },
  poolHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
  },
  poolIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  poolTitle: {
    color: '#FFFFFF',
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  poolSubtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: scale(7.5),
    letterSpacing: 1,
    marginTop: scale(2),
    fontFamily: fonts.bold,
  },
  poolNote: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    lineHeight: scale(12),
    marginTop: scale(4),
  },
  poolValue: {
    color: '#FFFFFF',
    fontSize: scale(21),
    lineHeight: scale(22),
    fontFamily: fonts.extrabold,
    textAlign: 'right',
  },
  poolValueUnit: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: scale(9),
    fontFamily: fonts.bold,
  },
  progress: {
    height: scale(10),
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: scale(5),
    overflow: 'hidden',
    marginTop: scale(16),
  },
  progressFill: {
    width: '0%',
    height: '100%',
    backgroundColor: '#F97316',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: scale(6),
  },
  progressText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: scale(7),
    fontFamily: fonts.bold,
  },
  zoneRow: {
    flexDirection: 'row',
    gap: scale(9),
    marginBottom: scale(14),
  },
  zonePill: {
    width: scale(48),
    height: scale(42),
    borderRadius: scale(21),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  zoneText: {
    fontSize: scale(11),
    fontFamily: fonts.bold,
  },
  zoneCard: {
    padding: scale(16),
    borderRadius: scale(18),
    marginBottom: scale(18),
  },
  zoneHeader: {
    fontSize: scale(11),
    fontFamily: fonts.bold,
  },
  chips: {
    flexDirection: 'row',
    gap: scale(6),
    marginVertical: scale(6),
  },
  priority: {
    color: '#F05A16',
    backgroundColor: '#FFF0E4',
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
  batteryChip: {
    color: '#5B6A94',
    backgroundColor: '#EEF0F8',
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
});
