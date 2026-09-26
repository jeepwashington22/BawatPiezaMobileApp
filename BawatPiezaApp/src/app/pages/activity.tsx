import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/screen-shell';
import { fonts, useTheme, type ThemeColors } from '../../theme';
import { scale } from '../../components/glass-ui';

type Activity = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  time: string;
  tone: 'blue' | 'orange' | 'red' | 'slate';
};

const ACTIVITIES: Activity[] = [
  { icon: 'person-outline', title: 'Admin changed lighting schedule', time: '11:32 PM', tone: 'blue' },
  { icon: 'flash-outline', title: 'System switched to grid', time: '11:03 PM', tone: 'orange' },
  { icon: 'warning-outline', title: 'Emergency override activated', time: '11:45 AM', tone: 'red' },
  { icon: 'flash-outline', title: 'Battery Bank A reached 80% — switched to battery', time: '9:14 AM', tone: 'blue' },
  { icon: 'color-wand-outline', title: 'Maintenance staff acknowledged tile inspection alert', time: 'Yesterday · 4:52 PM', tone: 'slate' },
];

const TONES = {
  blue: { background: '#E3EFFB', icon: '#1764B0' },
  orange: { background: '#FFF0DC', icon: '#F59E0B' },
  red: { background: '#FDEAE2', icon: '#F97316' },
  slate: { background: '#EEF1F6', icon: '#244578' },
};

export default function ActivityScreen() {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const [tab, setTab] = useState<'history' | 'activity'>('activity');
  const [query, setQuery] = useState('');
  const activities = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? ACTIVITIES.filter((item) => item.title.toLowerCase().includes(value)) : ACTIVITIES;
  }, [query]);

  return (
    <ScreenShell title="Audit Trail" showBack>
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('history')} style={[styles.tab, tab === 'history' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History Log</Text>
        </Pressable>
        <Pressable onPress={() => setTab('activity')} style={[styles.tab, tab === 'activity' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'activity' && styles.tabTextActive]}>Activity Log</Text>
        </Pressable>
      </View>

      {tab === 'history' ? <HistoryLog styles={styles} /> : (
        <>
          <Text style={styles.intro}>Every admin action and automated system event, timestamped, in order.</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={c.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search activity..." placeholderTextColor={c.muted} style={styles.searchInput} accessibilityLabel="Search activity log" />
          </View>
          <View style={styles.listCard}>
            {activities.length ? activities.map((activity, index) => {
              const tone = TONES[activity.tone];
              return (
                <View key={`${activity.title}-${activity.time}`} style={[styles.activityRow, index > 0 && styles.activityBorder]}>
                  <View style={[styles.activityIcon, { backgroundColor: tone.background }]}><Ionicons name={activity.icon} size={17} color={tone.icon} /></View>
                  <View style={styles.activityCopy}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={styles.activityTime}>{activity.time}</Text></View>
                </View>
              );
            }) : <Text style={styles.emptyText}>No activity matches your search.</Text>}
          </View>
        </>
      )}
    </ScreenShell>
  );
}

function HistoryLog({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  const rows = [
    ['Aug 1–Aug 7', '34h', '20.2h', '54.2h'],
    ['Aug 8–Aug 14', '39.5h', '19.8h', '59.2h'],
    ['Aug 15–Aug 21', '35h', '21.2h', '56.2h'],
    ['Aug 22–Aug 28', '35.5h', '17.2h', '52.8h'],
    ['Aug 29–Aug 30', '9.8h', '3.8h', '13.5h'],
  ];
  const bars = [55, 72, 46, 80, 61, 88, 67, 50, 75, 93, 58, 70, 48, 82, 64, 90, 55, 73];
  return (
    <>
      <View style={styles.rangeTabs}>
        <Text style={styles.rangeText}>Today</Text><Text style={styles.rangeText}>This Week</Text><Text style={[styles.rangeText, styles.rangeSelected]}>This Month</Text>
      </View>
      <View style={styles.metricRow}><View style={styles.historyMetric}><Text style={styles.batteryValue}>153.8h</Text><Text style={styles.metricLabel}>Battery Hours</Text></View><View style={styles.historyMetric}><Text style={styles.gridValue}>82.2h</Text><Text style={styles.metricLabel}>Grid Hours</Text></View></View>
      <View style={styles.historySection}><Text style={styles.sectionLabel}>CHART</Text><Text style={styles.dateLabel}>Aug 1–30, 2026</Text></View>
      <View style={styles.chartCard}><View style={styles.legend}><Text style={styles.batteryLegend}>● Battery</Text><Text style={styles.gridLegend}>● Grid</Text></View><View style={styles.bars}>{bars.map((height, index) => <View key={index} style={styles.barColumn}><View style={[styles.bar, { height: height * 0.62 }]} /><View style={[styles.bar, styles.gridBar, { height: (100 - height / 2) * 0.45 }]} /></View>)}</View></View>
      <Text style={styles.sectionLabel}>TABLE</Text>
      <View style={styles.tableCard}><View style={styles.tableHeader}><Text>WEEK</Text><Text>BATTERY</Text><Text>GRID</Text><Text>TOTAL</Text></View>{rows.map((row) => <View key={row[0]} style={styles.tableRow}>{row.map((cell, index) => <Text key={index} style={index === 0 ? styles.weekCell : styles.tableCell}>{cell}</Text>)}</View>)}</View>
      <Text style={styles.sectionLabel}>EXPORT REPORTS</Text><View style={styles.exportRow}><Pressable style={styles.exportButton}><Text style={styles.exportText}>PDF</Text></Pressable><Pressable style={styles.exportButton}><Text style={styles.exportText}>CSV</Text></Pressable></View>
    </>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: scale(12), padding: scale(4), marginBottom: scale(14) },
  tab: { flex: 1, alignItems: 'center', paddingVertical: scale(10), borderRadius: scale(9) },
  tabActive: { backgroundColor: '#F97316' },
  tabText: { color: c.muted, fontSize: scale(11), fontFamily: fonts.bold },
  tabTextActive: { color: '#FFFFFF' },
  intro: { color: c.muted, fontSize: scale(10), lineHeight: scale(15), marginHorizontal: scale(4), marginBottom: scale(10) },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(12), paddingHorizontal: scale(12), minHeight: scale(44), marginBottom: scale(12) },
  searchInput: { flex: 1, color: c.text, fontSize: scale(12), fontFamily: fonts.medium, marginLeft: scale(8), paddingVertical: 0 },
  listCard: { backgroundColor: c.surface, borderRadius: scale(16), paddingHorizontal: scale(12), paddingVertical: scale(4), borderWidth: 1, borderColor: c.line },
  activityRow: { flexDirection: 'row', alignItems: 'center', minHeight: scale(72), paddingVertical: scale(9) },
  activityBorder: { borderTopWidth: 1, borderTopColor: c.line },
  activityIcon: { width: scale(42), height: scale(42), borderRadius: scale(13), alignItems: 'center', justifyContent: 'center', marginRight: scale(12) },
  activityCopy: { flex: 1 },
  activityTitle: { color: c.text, fontSize: scale(12), lineHeight: scale(16), fontFamily: fonts.extrabold },
  activityTime: { color: c.muted, fontSize: scale(10), fontFamily: fonts.medium, marginTop: scale(2) },
  emptyText: { color: c.muted, textAlign: 'center', fontSize: scale(12), paddingVertical: scale(24), fontFamily: fonts.medium },
  rangeTabs: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: c.surface, borderRadius: scale(12), paddingVertical: scale(10), marginBottom: scale(10) },
  rangeText: { color: c.muted, fontSize: scale(10), fontFamily: fonts.bold },
  rangeSelected: { color: '#F97316' },
  metricRow: { flexDirection: 'row', gap: scale(8), marginBottom: scale(10) },
  historyMetric: { flex: 1, backgroundColor: c.surface, borderRadius: scale(15), padding: scale(14) },
  batteryValue: { color: '#F97316', fontSize: scale(17), fontFamily: fonts.extrabold },
  gridValue: { color: '#16A34A', fontSize: scale(17), fontFamily: fonts.extrabold },
  metricLabel: { color: c.muted, fontSize: scale(10), fontFamily: fonts.medium, marginTop: scale(2) },
  historySection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: scale(2), marginBottom: scale(7) },
  sectionLabel: { color: c.muted, fontSize: scale(10), letterSpacing: 1.1, fontFamily: fonts.extrabold, marginTop: scale(10), marginBottom: scale(7) },
  dateLabel: { color: c.text, fontSize: scale(10), fontFamily: fonts.bold },
  chartCard: { backgroundColor: c.surface, borderRadius: scale(17), padding: scale(14), marginBottom: scale(8) },
  legend: { flexDirection: 'row', gap: scale(14), marginBottom: scale(8) },
  batteryLegend: { color: '#F97316', fontSize: scale(10), fontFamily: fonts.bold },
  gridLegend: { color: '#16A34A', fontSize: scale(10), fontFamily: fonts.bold },
  bars: { height: scale(130), flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: scale(3) },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '48%', minHeight: scale(8), borderRadius: scale(3), backgroundColor: '#F97316' },
  gridBar: { backgroundColor: '#16A34A' },
  tableCard: { backgroundColor: c.surface, borderRadius: scale(15), paddingHorizontal: scale(10), paddingVertical: scale(7) },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: scale(7), borderBottomWidth: 1, borderBottomColor: c.line },
  tableHeaderText: { color: c.muted, fontSize: scale(8), fontFamily: fonts.bold },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: scale(8), borderBottomWidth: 1, borderBottomColor: c.line },
  weekCell: { width: '34%', color: c.text, fontSize: scale(10), fontFamily: fonts.bold },
  tableCell: { width: '22%', textAlign: 'right', color: c.text, fontSize: scale(10), fontFamily: fonts.bold },
  exportRow: { flexDirection: 'row', gap: scale(8), marginBottom: scale(12) },
  exportButton: { flex: 1, backgroundColor: c.surface, borderRadius: scale(12), alignItems: 'center', paddingVertical: scale(12) },
  exportText: { color: c.text, fontSize: scale(11), fontFamily: fonts.bold },
});
