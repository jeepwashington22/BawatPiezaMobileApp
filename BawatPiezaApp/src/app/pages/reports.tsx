import { StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';

const PRUSSIAN = '#0A2A4A';
const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.12)';

export default function ReportsScreen() {
  return (
    <ScreenShell title="Reports" subtitle="Generated reports & exports">
      <View style={styles.card}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Mirrors the web Reports dashboard — summaries and export history.</Text>
      </View>
      <TileLoader label="Loading reports..." size="md" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    padding: 18,
    marginBottom: 18,
  },
  title: { color: PRUSSIAN, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: MUTED, fontSize: 13, lineHeight: 20 },
});