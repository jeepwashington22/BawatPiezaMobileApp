import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenShell } from './screen-shell';
import { TopBar } from './top-bar';
import { Card, scale } from './glass-ui';
import { fonts, useTheme, type ThemeColors } from '../theme';

const FORECAST = [12, 37, 29, 34, 26, 31, 42, 20, 15, 25, 29, 12, 30, 35, 15];
const TREND = [58, 88, 60, 88, 72, 94, 47];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type ReportRange = 'today' | 'week' | 'month';

export function ReportsRedesign() {
  const { colors: c } = useTheme();
  const [range, setRange] = useState<ReportRange>('today');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [provisioned, setProvisioned] = useState(false);

  return (
    <ScreenShell scroll>
      <TopBar gutter={0} />
      <View style={styles.headingRow}>
        <View>
          <Text style={[styles.pageTitle, { color: c.text }]}>Reports</Text>
          <Text style={[styles.pageSubtitle, { color: c.muted }]}>Generation, savings &amp; impact</Text>
        </View>
        <Pressable style={[styles.filterButton, { backgroundColor: c.surface }]} accessibilityLabel="Choose report range">
          <Ionicons name="calendar-outline" size={scale(16)} color={c.text} />
        </Pressable>
      </View>   

      <ProvisioningCard
        c={c}
        scannerOpen={scannerOpen}
        setScannerOpen={setScannerOpen}
        manualCode={manualCode}
        setManualCode={setManualCode}
        provisioned={provisioned}
        setProvisioned={setProvisioned}
      />

      <Card mode="light" style={styles.forecastCard}>
        <View style={styles.titleRow}>
          <View><Text style={[styles.cardTitle, { color: c.text }]}>24h Generation Forecast</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Predicted kinetic output by zone, Gate Pathway</Text></View>
          <Text style={styles.todayBadge}>Today Only</Text>
        </View>
        <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>Forecast for Aug 30, 2026 · updated 2 min ago</Text></View>
        <ForecastChart c={c} />
      </Card>

      <View style={styles.anomaly}><View style={styles.anomalyIcon}><Ionicons name="warning-outline" size={scale(17)} color="#FFA51A" /></View><View style={{ flex: 1 }}><Text style={styles.anomalyTitle}>Anomaly Detected</Text><Text style={[styles.anomalyCopy, { color: c.muted }]}>Gate Pathway generation is 32% below the typical Tuesday average. Check for foot-traffic changes or a possible tile fault.</Text><Text style={[styles.historyLink, { color: c.text }]}>View Power-Source History →</Text></View></View>

      <Card mode="light" style={styles.trendCard}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Generation Trend</Text>
        <Text style={[styles.cardSubtitle, { color: c.muted }]}>Actual kWh harvested, last 7 days</Text>
        <View style={styles.trendChart}>{TREND.map((value, index) => <View key={DAYS[index]} style={styles.trendColumn}><View style={[styles.trendBar, { height: `${value}%`, backgroundColor: index % 2 === 1 ? '#F97316' : '#0B4B9C' }]} /><Text style={[styles.dayLabel, { color: c.muted }]}>{DAYS[index]}</Text></View>)}</View>
      </Card>

      <View style={styles.sectionRow}><Text style={[styles.sectionLabel, { color: c.muted }]}>BILLING IMPACT</Text><View style={styles.rangeTabs}>{(['today', 'week', 'month'] as ReportRange[]).map((item) => <Pressable key={item} onPress={() => setRange(item)}><Text style={[styles.rangeText, { color: range === item ? c.orange : c.muted }]}>{item === 'today' ? 'Today' : item === 'week' ? '7D' : '30D'}</Text></Pressable>)}</View></View>
      <View style={styles.metricRow}><Metric value={range === 'today' ? '30' : range === 'week' ? '214' : '890'} label="KWH HARVESTED" note="↑12% vs yesterday" color="#F97316" c={c} /><Metric value={range === 'today' ? '₱114' : range === 'week' ? '₱688' : '₱2,314'} label="MERALCO SAVINGS" note="▲ 8%" color="#0B63B7" c={c} /></View>

      <Card mode="light" style={styles.mixCard}><Text style={[styles.cardTitle, { color: c.text }]}>Power Source Mix</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Where today's power came from</Text><View style={styles.mixBar}><View style={[styles.mixSegment, { flex: 46, backgroundColor: '#F97316' }]} /><View style={[styles.mixSegment, { flex: 32, backgroundColor: '#16A34A' }]} /><View style={[styles.mixSegment, { flex: 22, backgroundColor: '#0B4B9C' }]} /></View><View style={styles.legend}><Legend color="#F97316" label="Waste-to-Energy 46%" c={c} /><Legend color="#16A34A" label="Solar 32%" c={c} /><Legend color="#0B4B9C" label="Grid 22%" c={c} /></View></Card>
    </ScreenShell>
  );
}

function ProvisioningCard({
  c,
  scannerOpen,
  setScannerOpen,
  manualCode,
  setManualCode,
  provisioned,
  setProvisioned,
}: {
  c: ThemeColors;
  scannerOpen: boolean;
  setScannerOpen: (value: boolean) => void;
  manualCode: string;
  setManualCode: (value: string) => void;
  provisioned: boolean;
  setProvisioned: (value: boolean) => void;
}) {
  if (provisioned) {
    return (
      <View style={[styles.provisionedCard, { backgroundColor: c.surface }]}>
        <View style={styles.provisionedIcon}><Ionicons name="checkmark" size={scale(18)} color="#FFFFFF" /></View>
        <View style={styles.provisionedCopy}>
          <Text style={[styles.provisionedTitle, { color: c.text }]}>Gate Pathway provisioned</Text>
          <Text style={[styles.cardSubtitle, { color: c.muted }]}>Device GP-042 · Online just now</Text>
        </View>
        <Pressable onPress={() => setProvisioned(false)} accessibilityLabel="Add another device"><Ionicons name="add-circle-outline" size={scale(22)} color={c.orange} /></Pressable>
      </View>
    );
  }

  return (
    <Card mode="light" style={styles.provisionCard}>
      <View style={styles.provisionHeader}>
        <View style={styles.provisionIcon}><Ionicons name="scan-outline" size={scale(18)} color="#FFFFFF" /></View>
        <View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: c.text }]}>Provision a power source</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Scan a device code to add it to your energy network</Text></View>
        <Text style={styles.newBadge}>NEW</Text>
      </View>
      {scannerOpen ? (
        <View style={styles.scannerArea}>
          <View style={styles.scanFrame}><View style={[styles.scanCorner, styles.cornerTopLeft]} /><View style={[styles.scanCorner, styles.cornerTopRight]} /><View style={[styles.scanCorner, styles.cornerBottomLeft]} /><View style={[styles.scanCorner, styles.cornerBottomRight]} /><View style={styles.scanLine} /><Ionicons name="qr-code-outline" size={scale(54)} color="rgba(255,255,255,0.8)" /></View>
          <Text style={styles.scanHint}>Align the QR code inside the frame</Text>
          <Pressable onPress={() => setProvisioned(true)} style={styles.scanButton}><Ionicons name="scan" size={scale(16)} color="#FFFFFF" /><Text style={styles.scanButtonText}>Simulate Scan</Text></Pressable>
          <Pressable onPress={() => setScannerOpen(false)}><Text style={[styles.cancelText, { color: c.muted }]}>Cancel</Text></Pressable>
        </View>
      ) : (
        <>
          <Pressable onPress={() => setScannerOpen(true)} style={styles.openScannerButton}><LinearGradient colors={['#FFA51A', '#F05A16']} style={StyleSheet.absoluteFill} /><Ionicons name="scan-outline" size={scale(17)} color="#FFFFFF" /><Text style={styles.openScannerText}>Scan device QR code</Text></Pressable>
          <View style={styles.manualRow}><View style={styles.manualLine} /><Text style={[styles.orText, { color: c.muted }]}>OR ENTER CODE MANUALLY</Text><View style={styles.manualLine} /></View>
          <View style={styles.codeRow}><TextInput value={manualCode} onChangeText={setManualCode} placeholder="e.g. GP-042" placeholderTextColor={c.muted} autoCapitalize="characters" style={[styles.codeInput, { color: c.text, borderColor: c.line }]} /><Pressable onPress={() => manualCode.trim() && setProvisioned(true)} style={[styles.provisionButton, { backgroundColor: manualCode.trim() ? '#0B63B7' : c.surfaceMuted }]}><Text style={[styles.provisionButtonText, { color: manualCode.trim() ? '#FFFFFF' : c.muted }]}>Add</Text></Pressable></View>
        </>
      )}
    </Card>
  );
}

function ForecastChart({ c }: { c: ThemeColors }) { return <View style={styles.forecastChart}><View style={styles.yAxis}>{['40W', '30W', '20W', '10W'].map((label) => <Text key={label} style={[styles.axisLabel, { color: c.muted }]}>{label}</Text>)}</View><View style={styles.forecastBars}>{FORECAST.map((value, index) => <View key={index} style={styles.forecastColumn}><View style={[styles.forecastBar, { height: `${value * 1.65}%` }]} /><Text style={[styles.axisLabel, { color: c.muted }]}>{index === 1 ? '10AM' : index === 7 ? '2PM' : index === 11 ? '6PM' : index === 14 ? '9PM' : ''}</Text></View>)}</View></View>; }
function Metric({ value, label, note, color, c }: { value: string; label: string; note: string; color: string; c: ThemeColors }) { return <Card mode="light" style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={[styles.metricLabel, { color: c.muted }]}>{label}</Text><Text style={[styles.metricNote, { color: note.includes('↑') ? '#159447' : c.ok }]}>{note}</Text></Card>; }
function Legend({ color, label, c }: { color: string; label: string; c: ThemeColors }) { return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={[styles.legendText, { color: c.muted }]}>{label}</Text></View>; }

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(12) }, pageTitle: { fontSize: scale(22), fontFamily: fonts.extrabold }, pageSubtitle: { fontSize: scale(11), fontFamily: fonts.medium, marginTop: scale(2) }, filterButton: { width: scale(38), height: scale(38), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  forecastCard: { padding: scale(14), borderRadius: scale(18), marginBottom: scale(10) }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, cardTitle: { fontSize: scale(12), fontFamily: fonts.bold }, cardSubtitle: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) }, todayBadge: { color: '#C17D17', backgroundColor: '#FFF1D8', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: scale(4), fontSize: scale(8), fontFamily: fonts.bold }, statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: scale(5), backgroundColor: '#E7E8F0', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: scale(5), marginTop: scale(9) }, statusDot: { width: scale(6), height: scale(6), borderRadius: scale(3), backgroundColor: '#0B63B7' }, statusText: { color: '#26385E', fontSize: scale(8), fontFamily: fonts.bold },
  provisionCard: { padding: scale(14), marginBottom: scale(10), borderRadius: scale(18) }, provisionHeader: { flexDirection: 'row', alignItems: 'center', gap: scale(9) }, provisionIcon: { width: scale(34), height: scale(34), borderRadius: scale(11), backgroundColor: '#0B63B7', alignItems: 'center', justifyContent: 'center' }, newBadge: { color: '#C17D17', backgroundColor: '#FFF1D8', paddingHorizontal: scale(6), paddingVertical: scale(3), borderRadius: scale(7), fontSize: scale(7), fontFamily: fonts.extrabold }, openScannerButton: { minHeight: scale(42), borderRadius: scale(12), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), marginTop: scale(13) }, openScannerText: { color: '#FFFFFF', fontSize: scale(10), fontFamily: fonts.bold }, manualRow: { flexDirection: 'row', alignItems: 'center', gap: scale(7), marginVertical: scale(12) }, manualLine: { flex: 1, height: 1, backgroundColor: 'rgba(10,42,74,0.1)' }, orText: { fontSize: scale(7), fontFamily: fonts.bold, letterSpacing: 0.5 }, codeRow: { flexDirection: 'row', gap: scale(7) }, codeInput: { flex: 1, minHeight: scale(38), borderWidth: 1, borderRadius: scale(10), paddingHorizontal: scale(10), fontSize: scale(10), fontFamily: fonts.medium }, provisionButton: { minWidth: scale(54), borderRadius: scale(10), alignItems: 'center', justifyContent: 'center' }, provisionButtonText: { fontSize: scale(10), fontFamily: fonts.bold }, scannerArea: { backgroundColor: '#0D2746', borderRadius: scale(14), alignItems: 'center', padding: scale(15), marginTop: scale(13) }, scanFrame: { width: scale(155), height: scale(125), borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', position: 'relative' }, scanCorner: { position: 'absolute', width: scale(17), height: scale(17), borderColor: '#FFA51A' }, cornerTopLeft: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3 }, cornerTopRight: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3 }, cornerBottomLeft: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3 }, cornerBottomRight: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3 }, scanLine: { position: 'absolute', left: scale(10), right: scale(10), top: '50%', height: 1, backgroundColor: '#FFA51A' }, scanHint: { color: 'rgba(255,255,255,0.75)', fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(10) }, scanButton: { backgroundColor: '#F97316', borderRadius: scale(10), paddingHorizontal: scale(16), paddingVertical: scale(9), flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: scale(11) }, scanButtonText: { color: '#FFFFFF', fontSize: scale(9), fontFamily: fonts.bold }, cancelText: { fontSize: scale(9), fontFamily: fonts.bold, marginTop: scale(10) }, provisionedCard: { flexDirection: 'row', alignItems: 'center', gap: scale(9), padding: scale(14), borderRadius: scale(18), marginBottom: scale(10) }, provisionedCopy: { flex: 1 }, provisionedIcon: { width: scale(34), height: scale(34), borderRadius: scale(17), backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }, provisionedTitle: { fontSize: scale(12), fontFamily: fonts.bold },
  forecastChart: { flexDirection: 'row', height: scale(123), marginTop: scale(10) }, yAxis: { justifyContent: 'space-between', paddingBottom: scale(20), paddingRight: scale(7) }, forecastBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: scale(3) }, forecastColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }, forecastBar: { width: '100%', maxHeight: scale(86), minHeight: scale(8), borderRadius: scale(5), backgroundColor: '#F97316' }, axisLabel: { fontSize: scale(7), fontFamily: fonts.medium },
  anomaly: { flexDirection: 'row', gap: scale(8), padding: scale(13), backgroundColor: '#F1EEEA', borderRadius: scale(17), marginBottom: scale(10) }, anomalyIcon: { width: scale(23), height: scale(23), alignItems: 'center', justifyContent: 'center' }, anomalyTitle: { color: '#F97316', fontSize: scale(10), fontFamily: fonts.bold }, anomalyCopy: { fontSize: scale(9), lineHeight: scale(12), fontFamily: fonts.medium, marginTop: scale(2) }, historyLink: { fontSize: scale(9), fontFamily: fonts.bold, marginTop: scale(6) },
  trendCard: { padding: scale(14), marginBottom: scale(17) }, trendChart: { height: scale(103), flexDirection: 'row', alignItems: 'flex-end', gap: scale(5), marginTop: scale(14) }, trendColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch' }, trendBar: { minHeight: scale(20), borderRadius: scale(4), marginBottom: scale(7) }, dayLabel: { textAlign: 'center', fontSize: scale(7), fontFamily: fonts.medium }, sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(7) }, sectionLabel: { fontSize: scale(10), letterSpacing: 1.1, fontFamily: fonts.extrabold }, rangeTabs: { flexDirection: 'row', gap: scale(9) }, rangeText: { fontSize: scale(9), fontFamily: fonts.bold }, metricRow: { flexDirection: 'row', gap: scale(8), marginBottom: scale(10) }, metric: { flex: 1, padding: scale(12), minHeight: scale(78) }, metricValue: { fontSize: scale(17), fontFamily: fonts.extrabold }, metricLabel: { fontSize: scale(7), fontFamily: fonts.bold, marginTop: scale(2) }, metricNote: { fontSize: scale(8), fontFamily: fonts.bold, marginTop: scale(5) }, mixCard: { padding: scale(14), marginBottom: scale(20) }, mixBar: { flexDirection: 'row', height: scale(7), borderRadius: scale(5), overflow: 'hidden', marginTop: scale(15) }, mixSegment: { height: '100%' }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginTop: scale(10) }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: scale(4) }, legendDot: { width: scale(7), height: scale(7), borderRadius: scale(4) }, legendText: { fontSize: scale(8), fontFamily: fonts.medium },
});
