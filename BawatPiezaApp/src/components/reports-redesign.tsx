import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenShell } from './screen-shell';
import { TopBar } from './top-bar';
import { Card, scale } from './glass-ui';
import { fonts, useTheme, type ThemeColors } from '../theme';

const FORECAST = [12, 37, 29, 34, 26, 31, 42, 20, 15, 25, 29, 12, 30, 35, 15];
const TREND = [58, 88, 60, 88, 72, 94, 47];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type ReportRange = 'today' | 'week' | 'month';

export function ReportsRedesign() {
  const { colors: c, mode } = useTheme();
  const [range, setRange] = useState<ReportRange>('today');

  return (
    <ScreenShell scroll>
      <TopBar gutter={0} title="Reports" subtitle="Generation, savings & impact" />
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>BILLING IMPACT</Text>
        <View style={styles.rangeTabs}>
          {(['today', 'week', 'month'] as ReportRange[]).map((item) => (
            <Pressable key={item} onPress={() => setRange(item)}>
              <View style={[styles.rangeChip, range === item && { backgroundColor: mode === 'dark' ? 'rgba(96,165,250,0.22)' : '#DBEAFE', borderColor: mode === 'dark' ? 'rgba(147,197,253,0.50)' : '#93C5FD' }]}>
                <Text style={[styles.rangeText, { color: range === item ? (mode === 'dark' ? '#BFDBFE' : '#1D4ED8') : c.muted }]}>{item === 'today' ? 'Today' : item === 'week' ? '7D' : '30D'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.metricColumn}>
        <Metric mode={mode} icon="flash" value={range === 'today' ? '30' : range === 'week' ? '214' : '890'} label="KWH HARVESTED" note="↑12% vs yesterday" color="#0B63B7" c={c} />
        <Metric mode={mode} icon="wallet" value={range === 'today' ? '₱114' : range === 'week' ? '₱688' : '₱2,314'} label="MERALCO SAVINGS" note="▲ 8%" color="#F97316" c={c} />
      </View>

      <Card mode={mode} style={styles.forecastCard}>
        <View style={styles.titleRow}>
          <View><Text style={[styles.cardTitle, { color: c.text }]}>24h Generation Forecast</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Predicted kinetic output by zone, Gate Pathway</Text></View>
          <Text style={[styles.todayBadge, { color: mode === 'dark' ? '#FDBA74' : '#C17D17', backgroundColor: mode === 'dark' ? 'rgba(249,115,22,0.16)' : '#FFF1D8' }]}>Today Only</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#E7E8F0' }]}><View style={styles.statusDot} /><Text style={[styles.statusText, { color: mode === 'dark' ? '#93C5FD' : '#26385E' }]}>Forecast for Aug 30, 2026 · updated 2 min ago</Text></View>
        <ForecastChart c={c} mode={mode} />
      </Card>

      <View style={[styles.anomaly, { backgroundColor: mode === 'dark' ? '#17120D' : '#F1EEEA', borderColor: mode === 'dark' ? 'rgba(251,146,60,0.20)' : 'transparent' }]}><View style={styles.anomalyIcon}><Ionicons name="warning-outline" size={scale(17)} color="#FFA51A" /></View><View style={{ flex: 1 }}><Text style={styles.anomalyTitle}>Anomaly Detected</Text><Text style={[styles.anomalyCopy, { color: c.muted }]}>Gate Pathway generation is 32% below the typical Tuesday average. Check for foot-traffic changes or a possible tile fault.</Text><Text style={[styles.historyLink, { color: c.text }]}>View Power-Source History →</Text></View></View>

      <Card mode={mode} style={styles.trendCard}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Generation Trend</Text>
        <Text style={[styles.cardSubtitle, { color: c.muted }]}>Actual kWh harvested, last 7 days</Text>
        <View style={[styles.trendChart, { backgroundColor: mode === 'dark' ? '#111820' : '#F7F9FC' }]}>{TREND.map((value, index) => <View key={DAYS[index]} style={styles.trendColumn}><View style={[styles.trendBar, { height: `${value}%`, backgroundColor: index % 2 === 1 ? '#FB923C' : '#60A5FA', shadowColor: index % 2 === 1 ? '#FB923C' : '#60A5FA' }]} /><Text style={[styles.dayLabel, { color: c.muted }]}>{DAYS[index]}</Text></View>)}</View>
      </Card>

      <Card mode={mode} style={styles.mixCard}><Text style={[styles.cardTitle, { color: c.text }]}>Power Source Mix</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Where today&apos;s power came from</Text><View style={styles.mixBar}><View style={[styles.mixSegment, { flex: 46, backgroundColor: '#F97316' }]} /><View style={[styles.mixSegment, { flex: 32, backgroundColor: '#34D399' }]} /><View style={[styles.mixSegment, { flex: 22, backgroundColor: '#60A5FA' }]} /></View><View style={styles.legend}><Legend color="#F97316" label="Waste-to-Energy 46%" c={c} /><Legend color="#34D399" label="Solar 32%" c={c} /><Legend color="#60A5FA" label="Grid 22%" c={c} /></View></Card>
    </ScreenShell>
  );
}

function ForecastChart({ c, mode }: { c: ThemeColors; mode: 'light' | 'dark' }) { return <View style={[styles.forecastChart, { backgroundColor: mode === 'dark' ? '#111820' : '#F7F9FC' }]}><View style={styles.yAxis}>{['40W', '30W', '20W', '10W'].map((label) => <Text key={label} style={[styles.axisLabel, { color: c.muted }]}>{label}</Text>)}</View><View style={styles.forecastBars}>{FORECAST.map((value, index) => <View key={index} style={styles.forecastColumn}><View style={[styles.forecastBar, { height: `${value * 1.65}%`, backgroundColor: index % 3 === 0 ? '#F97316' : '#60A5FA' }]} /><Text style={[styles.axisLabel, { color: c.muted }]}>{index === 1 ? '10AM' : index === 7 ? '2PM' : index === 11 ? '6PM' : index === 14 ? '9PM' : ''}</Text></View>)}</View></View>; }
function Metric({ value, label, note, color, icon, mode }: { value: string; label: string; note: string; color: string; icon: 'flash' | 'wallet'; c: ThemeColors; mode: 'light' | 'dark' }) { return <View style={[styles.metric, { backgroundColor: color }]}><View style={styles.metricIcon}><Ionicons name={icon} size={scale(19)} color="#FFFFFF" /></View><View style={styles.metricMain}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View><Text style={styles.metricNote}>{note}</Text></View>; }
function Legend({ color, label, c }: { color: string; label: string; c: ThemeColors }) { return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={[styles.legendText, { color: c.muted }]}>{label}</Text></View>; }

const styles = StyleSheet.create({
  metricColumn: { gap: scale(8), marginBottom: scale(14) },
  forecastCard: { padding: scale(14), borderRadius: scale(18), marginBottom: scale(10) }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, cardTitle: { fontSize: scale(12), fontFamily: fonts.bold }, cardSubtitle: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) }, todayBadge: { color: '#C17D17', backgroundColor: '#FFF1D8', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: scale(4), fontSize: scale(8), fontFamily: fonts.bold }, statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: scale(5), backgroundColor: '#E7E8F0', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: scale(5), marginTop: scale(9) }, statusDot: { width: scale(6), height: scale(6), borderRadius: scale(3), backgroundColor: '#0B63B7' }, statusText: { color: '#26385E', fontSize: scale(8), fontFamily: fonts.bold },
  forecastChart: { flexDirection: 'row', height: scale(123), marginTop: scale(10), borderRadius: scale(12), padding: scale(9), paddingBottom: scale(5) },
 yAxis: { justifyContent: 'space-between', paddingBottom: scale(20), paddingRight: scale(7) }, forecastBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: scale(3) }, forecastColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }, forecastBar: { width: '100%', maxHeight: scale(86), minHeight: scale(8), borderRadius: scale(5), shadowColor: '#60A5FA', shadowOpacity: 0.28, shadowRadius: scale(5), elevation: 2 }, axisLabel: { fontSize: scale(7), fontFamily: fonts.medium },
  anomaly: { flexDirection: 'row', gap: scale(8), padding: scale(13), borderWidth: 1, borderRadius: scale(17), marginBottom: scale(10) }, anomalyIcon: { width: scale(23), height: scale(23), alignItems: 'center', justifyContent: 'center' }, anomalyTitle: { color: '#F97316', fontSize: scale(10), fontFamily: fonts.bold }, anomalyCopy: { fontSize: scale(9), lineHeight: scale(12), fontFamily: fonts.medium, marginTop: scale(2) }, historyLink: { fontSize: scale(9), fontFamily: fonts.bold, marginTop: scale(6) },
  trendCard: { padding: scale(14), marginBottom: scale(17) }, trendChart: { height: scale(103), flexDirection: 'row', alignItems: 'flex-end', gap: scale(5), marginTop: scale(14), borderRadius: scale(12), padding: scale(9), paddingBottom: scale(7) }, trendColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch' }, trendBar: { minHeight: scale(20), borderRadius: scale(4), marginBottom: scale(7), shadowOpacity: 0.3, shadowRadius: scale(4), elevation: 2 }, dayLabel: { textAlign: 'center', fontSize: scale(7), fontFamily: fonts.medium }, sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(7) }, sectionLabel: { fontSize: scale(10), letterSpacing: 1.1, fontFamily: fonts.extrabold }, rangeTabs: { flexDirection: 'row', gap: scale(4) }, rangeChip: { borderWidth: 1, borderColor: 'transparent', borderRadius: scale(8), paddingHorizontal: scale(8), paddingVertical: scale(5) }, rangeText: { fontSize: scale(9), fontFamily: fonts.bold }, metric: { width: '100%', minHeight: scale(78), borderRadius: scale(16), padding: scale(15), flexDirection: 'row', alignItems: 'center', gap: scale(11) }, metricIcon: { width: scale(34), height: scale(34), borderRadius: scale(11), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }, metricMain: { flex: 1 }, metricValue: { color: '#FFFFFF', fontSize: scale(23), fontFamily: fonts.extrabold }, metricLabel: { color: 'rgba(255,255,255,0.74)', fontSize: scale(8), letterSpacing: 1, marginTop: scale(3), fontFamily: fonts.bold }, metricNote: { color: '#FFFFFF', fontSize: scale(10), fontFamily: fonts.extrabold }, mixCard: { padding: scale(14), marginBottom: scale(20) }, mixBar: { flexDirection: 'row', height: scale(7), borderRadius: scale(5), overflow: 'hidden', marginTop: scale(15) }, mixSegment: { height: '100%' }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginTop: scale(10) }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: scale(4) }, legendDot: { width: scale(7), height: scale(7), borderRadius: scale(4) }, legendText: { fontSize: scale(8), fontFamily: fonts.medium },
});
