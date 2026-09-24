import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/screen-shell';
import { ContentCard } from '../../components/content-card';
import { fonts, useTheme, type Mode } from '../../theme';

type Pref = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; value: boolean };

const INITIAL: Pref[] = [
  { key: 'notifications', icon: 'notifications-outline', label: 'Notifications', sub: 'Harvest & sync updates', value: true },
  { key: 'autoSync', icon: 'sync-outline', label: 'Auto-sync', sub: 'Refresh sensor data automatically', value: true },
  { key: 'powerAlerts', icon: 'warning-outline', label: 'Power alerts', sub: 'Notify on low battery', value: false },
  { key: 'haptics', icon: 'finger-print-outline', label: 'Haptic feedback', sub: 'Vibrate on tile press', value: true },
];

const MODES: { key: Mode; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string }[] = [
  { key: 'light', icon: 'sunny-outline', label: 'Light', sub: 'Bright surfaces, high contrast' },
  { key: 'dark', icon: 'moon-outline', label: 'Dark', sub: 'Low-light friendly, butter accents' },
];

export default function PreferencesScreen() {
  const { colors: c, fonts: f, mode, setMode } = useTheme();
  const [prefs, setPrefs] = useState(INITIAL);

  const toggle = (key: string) =>
    setPrefs((prev) => prev.map((p) => (p.key === key ? { ...p, value: !p.value } : p)));

  return (
    <ScreenShell title="Preferences" showBack>
      {/* Theme */}
      <ContentCard eyebrow="Theme">
        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.modeCard,
                  { backgroundColor: active ? c.accent : c.surfaceMuted, borderColor: active ? c.accent : c.line },
                ]}
              >
                <Ionicons name={m.icon} size={22} color={active ? c.onAccent : c.muted} />
                <Text
                  style={[
                    styles.modeLabel,
                    { color: active ? c.onAccent : c.text, fontFamily: active ? f.bold : f.semibold },
                  ]}
                >
                  {m.label}
                </Text>
                <Text style={[styles.modeSub, { color: active ? c.onAccent : c.muted, opacity: active ? 0.85 : 1, fontFamily: f.regular }]}>
                  {m.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ContentCard>

      {/* General preferences */}
      <ContentCard eyebrow="Settings">
        {prefs.map((p, i) => (
          <View key={p.key} style={[styles.row, { borderBottomColor: c.line }, i === prefs.length - 1 ? styles.rowLast : null]}>
            <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
              <Ionicons name={p.icon} size={17} color={c.onAccentSoft} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, { color: c.text, fontFamily: f.semibold }]}>{p.label}</Text>
              <Text style={[styles.sub, { color: c.muted, fontFamily: f.regular }]}>{p.sub}</Text>
            </View>
            <Switch
              value={p.value}
              onValueChange={() => toggle(p.key)}
              trackColor={{ false: c.line, true: c.butter }}
              thumbColor={p.value ? c.accent : '#FFFFFF'}
            />
          </View>
        ))}
      </ContentCard>
      <Text style={[styles.hint, { color: c.muted, fontFamily: f.regular }]}>
        Theme is saved on this device and applied across the whole app.
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 10 },
  modeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    alignItems: 'flex-start',
    gap: 6,
  },
  modeLabel: { fontSize: 14 },
  modeSub: { fontSize: 10, lineHeight: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowLast: { borderBottomWidth: 0 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  text: { flex: 1 },
  label: { fontSize: 14 },
  sub: { fontSize: 11, marginTop: 1 },
  hint: { fontSize: 11, textAlign: 'center', marginTop: 4 },
});

