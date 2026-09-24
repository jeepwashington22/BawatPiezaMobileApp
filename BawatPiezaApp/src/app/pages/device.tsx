import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/screen-shell';
import { ContentCard } from '../../components/content-card';

const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.1)';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

type Service = { name: string; icon: keyof typeof Ionicons.glyphMap; status: 'pending' | 'ok' | 'fail'; detail: string };

export default function DeviceScreen() {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const BUTTER = c.butter;
  const MUTED = c.muted;
  const LINE = c.line;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  const OK = c.ok;
  const BAD = c.danger;
  const [services, setServices] = useState<Service[]>([
    { name: 'Backend API', icon: 'server-outline', status: 'pending', detail: `Checking ${API_URL}…` },
    { name: 'Supabase', icon: 'cloud-outline', status: 'pending', detail: 'Waiting for backend…' },
    { name: 'Redis', icon: 'flash-outline', status: 'pending', detail: 'Waiting for backend…' },
  ]);
  const [latency, setLatency] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    setServices((prev) => prev.map((s) => ({ ...s, status: 'pending', detail: 'Checking…' })));
    const start = Date.now();
    try {
      const res = await fetch(`${API_URL}/health`, { headers: { Accept: 'application/json' } });
      setLatency(Date.now() - start);
      const json = await res.json();
      setServices([
        {
          name: 'Backend API',
          icon: 'server-outline',
          status: res.ok ? 'ok' : 'fail',
          detail: `${res.ok ? 'Reachable' : `HTTP ${res.status}`} · ${Date.now() - start} ms · ${API_URL}`,
        },
        {
          name: 'Supabase',
          icon: 'cloud-outline',
          status: json?.supabase === 'ok' ? 'ok' : 'fail',
          detail: json?.supabase === 'ok' ? 'Connected' : 'Unreachable',
        },
        {
          name: 'Redis',
          icon: 'flash-outline',
          status: json?.redis === 'ok' ? 'ok' : 'fail',
          detail: json?.redis === 'ok' ? 'Connected' : 'Unreachable',
        },
      ]);
    } catch {
      setLatency(null);
      setServices((prev) =>
        prev.map((s) => ({ ...s, status: 'fail', detail: 'Unreachable — is the backend running?' })),
      );
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  return (
    <ScreenShell title="Device" showBack>
      <ContentCard eyebrow="Connected hardware">
        <Row icon="hardware-chip-outline" label="Zone" value="Bldg 4 · 1F Hallway A" last={false} />
        <Row icon="grid-outline" label="Tiles" value="30 (6 × 5)" last={false} />
        <Row icon="battery-charging-outline" label="Battery" value="78% · Charging" last={false} />
        <Row icon="bluetooth-outline" label="Firmware" value="v1.4.2" last />
      </ContentCard>

      <ContentCard
        eyebrow={latency !== null ? `Round trip ${latency} ms` : 'Run checks'}
        action={
          <Text onPress={runDiagnostics} style={styles.rerun}>
            {running ? 'Running…' : 'Re-run'}
          </Text>
        }
      >
        {services.map((s, i) => (
          <View key={s.name} style={[styles.row, i === services.length - 1 ? styles.rowLast : null]}>
            <View style={styles.icon}>
              <Ionicons name={s.icon} size={17} color={PRUSSIAN} />
            </View>
            <View style={styles.text}>
              <Text style={styles.label}>{s.name}</Text>
              <Text style={styles.sub}>{s.detail}</Text>
            </View>
            {running && s.status === 'pending' ? (
              <ActivityIndicator size="small" color={PRUSSIAN} />
            ) : (
              <View style={[styles.dot, { backgroundColor: s.status === 'ok' ? OK : s.status === 'fail' ? BAD : BUTTER }]} />
            )}
          </View>
        ))}
      </ContentCard>
    </ScreenShell>
  );
}

function Row({ icon, label, value, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last: boolean }) {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  return (
    <View style={[styles.row, last ? styles.rowLast : null]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={17} color={PRUSSIAN} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowLast: { borderBottomWidth: 0 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  text: { flex: 1 },
  label: { color: PRUSSIAN, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold, flex: 1 },
  sub: { color: MUTED, fontSize: 11, marginTop: 1 },
  value: { color: PRUSSIAN, fontSize: 13, fontWeight: '700', fontFamily: fonts.bold },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rerun: { color: PRUSSIAN, fontSize: 12, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};





