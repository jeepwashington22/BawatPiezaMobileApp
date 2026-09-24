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
    <ScreenShell scroll title="Power Management" showBack>
      <View style={styles.header}>
        <Text style={[styles.subtitle, { color: c.muted }]}>Manage allocation</Text>
      </View>

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

      {tab === 'monitor' && <Monitor c={c} />}
      {tab === 'configure' && <Configure c={c} />}
      {tab === 'allocation' && <Allocation c={c} />}
    </ScreenShell>
  );
}

function Monitor({ c }: { c: ThemeColors }) {
  const [enabled, setEnabled] = useState(true);

  return (
    <>
      <Card mode="light" style={styles.featureCard}>
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

      <View style={styles.bankRow}>
        <BankCard name="BANK A" value="100%" status="Full — charging stopped" tone="good" c={c} />
        <BankCard name="BANK B" value="62%" status="Charging" tone="fair" c={c} />
      </View>

      <View style={[styles.notice, { backgroundColor: '#F4F0E9' }]}>
        <Text style={[styles.noticeTitle, { color: c.orange }]}>Bank A reached 100%</Text>
        <Text style={[styles.noticeCopy, { color: c.muted }]}>Charging stopped automatically to prevent overcharge. Notification sent to Admin &amp; Maintenance.</Text>
      </View>

      <SectionLabel label="CURRENTLY DISCHARGING" action="Change in Overrides" c={c} />

      <Card mode="light" style={styles.dischargeCard}>
        <View style={styles.dischargeTextWrap}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Bank A is supplying the campus</Text>
          <Text style={[styles.cardCopy, { color: c.muted }]}>Following Smart Auto-Switching — tap to override manually</Text>
        </View>
        <Ionicons name="chevron-down" size={scale(18)} color={c.muted} />
      </Card>
    </>
  );
}

function Configure({ c }: { c: ThemeColors }) {
  return (
    <>
      <SectionLabel label="BATTERY ALERT THRESHOLDS" c={c} />
      <View style={styles.bankRow}>
        <ThresholdCard name="BANK A" c={c} />
        <ThresholdCard name="BANK B" c={c} />
      </View>

      <SectionLabel label="TIME-OF-USE SCHEDULER" c={c} />

      <Card mode="light" style={styles.schedulerCard}>
        <ScheduleRow title="Peak Hours" note="Use battery power" time="7:00 AM - 7:00 PM" c={c} />
        <ScheduleRow title="Off-Peak Hours" note="Draw from grid" time="8:00 PM - 6:00 AM" c={c} />

        <Pressable style={styles.scheduleLink}>
          <Text style={[styles.smallBold, { color: c.text }]}>How this schedule is set? </Text>
          <Ionicons name="chevron-down" size={scale(13)} color={c.text} />
        </Pressable>

        <ActionButton label="Check a zone's runtime need against this window →" />
      </Card>
    </>
  );
}

function Allocation({ c }: { c: ThemeColors }) {
  const [zone, setZone] = useState('1F');

  return (
    <>
      <View style={styles.infoBand}>
        <Text style={[styles.noticeTitle, { color: c.orange }]}>Campus-wide power allocation</Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Assign each battery-powered zone its hours and start time — nothing changes on campus until you confirm.
        </Text>
      </View>

      <SectionLabel label="AVAILABLE BATTERY POOL" c={c} />

      <Card mode="light" style={styles.poolCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={[styles.smallBold, { color: c.muted }]}>BANK A + BANK B</Text>
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
      </Card>

      <SectionLabel label="ALL ZONES" c={c} />

      <View style={styles.zoneRow}>
        {['1F', '2F', '3F', '4F'].map((item) => {
          const active = zone === item;
          return (
            <Pressable
              key={item}
              onPress={() => setZone(item)}
              style={[styles.zonePill, { backgroundColor: active ? '#0A56AD' : c.surface }]}
            >
              <Text style={[styles.zoneText, { color: active ? '#FFFFFF' : c.muted }]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>

      <ZoneCard c={c} />
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
    <Card mode="light" style={styles.bankCard}>
      <View style={styles.rowBetween}>
        <Text style={[styles.smallBold, { color: c.muted }]}>{name}</Text>
        <Text
          style={[
            styles.statusPill,
            {
              backgroundColor: tone === 'good' ? '#E8F2FF' : '#FFF1D8',
              color: tone === 'good' ? '#2466B8' : '#C17D17',
            },
          ]}
        >
          {tone === 'good' ? 'Good' : 'Fair'}
        </Text>
      </View>

      <Text style={[styles.bankValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.bankStatus, { color: tone === 'good' ? c.orange : c.muted }]}>{status}</Text>
    </Card>
  );
}

function ThresholdCard({ name, c }: { name: string; c: ThemeColors }) {
  return (
    <Card mode="light" style={styles.thresholdCard}>
      <Text style={[styles.smallBold, { color: c.muted }]}>{name}</Text>
      <View style={styles.thresholdRow}>
        <Text style={[styles.cardCopy, { color: c.muted }]}>Alert below</Text>
        <Text style={[styles.thresholdValue, { color: c.orange }]}>25%</Text>
      </View>
    </Card>
  );
}

function ScheduleRow({ title, note, time, c }: { title: string; note: string; time: string; c: ThemeColors }) {
  return (
    <View style={styles.scheduleRow}>
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

function ZoneCard({ c }: { c: ThemeColors }) {
  return (
    <Card mode="light" style={styles.zoneCard}>
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
    padding: scale(5),
    borderRadius: scale(16),
    marginBottom: scale(14),
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    minHeight: scale(42),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeTab: {
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  tabText: {
    fontSize: scale(11),
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
  bankCard: {
    flex: 1,
    padding: scale(12),
    minHeight: scale(90),
    borderRadius: scale(16),
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
    fontSize: scale(22),
    fontFamily: fonts.extrabold,
    marginTop: scale(10),
  },
  bankStatus: {
    fontSize: scale(9),
    fontFamily: fonts.bold,
    marginTop: scale(6),
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
    flex: 1,
    padding: scale(14),
    minHeight: scale(82),
    borderRadius: scale(16),
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: scale(18),
  },
  thresholdValue: {
    fontSize: scale(20),
    fontFamily: fonts.extrabold,
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
    borderBottomColor: 'rgba(10,42,74,0.1)',
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
    borderBottomColor: 'rgba(10,42,74,0.1)',
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
  },
  poolCard: {
    padding: scale(16),
    borderRadius: scale(18),
    marginBottom: scale(18),
  },
  poolNote: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    lineHeight: scale(12),
    marginTop: scale(4),
  },
  poolValue: {
    fontSize: scale(21),
    lineHeight: scale(22),
    fontFamily: fonts.extrabold,
    textAlign: 'right',
  },
  progress: {
    height: scale(10),
    backgroundColor: '#D5D9E4',
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
    color: '#69769B',
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
