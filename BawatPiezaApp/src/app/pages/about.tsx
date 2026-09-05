import { fonts, useTheme, type ThemeColors } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/screen-shell';
import { ContentCard } from '../../components/content-card';

const MUTED = 'rgba(10, 42, 74, 0.62)';

export default function AboutScreen() {
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
  return (
    <ScreenShell>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="flash" size={34} color={PRUSSIAN} />
        </View>
        <Text style={styles.appName}>
          Bawat<Text style={{ color: BUTTER }}>Pieza</Text>
        </Text>
        <Text style={styles.tagline}>Waste Into Watts, Ions</Text>
        <Text style={styles.version}>Mobile App v1.0.0</Text>
      </View>

      <ContentCard eyebrow="About">
        <Text style={styles.body}>
          BawatPieza turns foot traffic into electricity. Piezoelectric tiles harvest
          pressure energy from every step, which is converted, stored and monitored in
          real time — reducing waste and powering spaces sustainably.
        </Text>
      </ContentCard>

      <ContentCard eyebrow="Components">
        <View style={styles.row}>
          <Text style={styles.label}>Mobile app</Text>
          <Text style={styles.value}>Expo / React Native</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.label}>Backend API</Text>
          <Text style={styles.value}>Express · Supabase · Redis · Brevo · MQTT</Text>
        </View>
      </ContentCard>

      <Text style={styles.copyright}>© 2026 BawatPieza Team · All rights reserved</Text>
    </ScreenShell>
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
  hero: { alignItems: 'center', marginBottom: 18 },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: BUTTER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appName: { color: PRUSSIAN, fontSize: 24, fontWeight: '900', fontFamily: fonts.extrabold, letterSpacing: -0.5 },
  tagline: { color: MUTED, fontSize: 12, marginTop: 2 },
  version: { color: MUTED, fontSize: 11, marginTop: 8 },
  body: { color: MUTED, fontSize: 13, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10, 42, 74, 0.08)',
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
  value: { color: MUTED, fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, maxWidth: '55%', textAlign: 'right' },
  copyright: { color: MUTED, fontSize: 10, textAlign: 'center', marginTop: 8 },
  });
};




