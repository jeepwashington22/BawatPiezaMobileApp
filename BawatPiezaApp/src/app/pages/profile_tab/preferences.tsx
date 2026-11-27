import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useState } from 'react';
import { AppText as Text } from '../../../components/app-text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenShell } from '../../../components/screen-shell';
import { FONT_SIZE_OPTIONS, useTheme, type FontSizeOption } from '../../../theme';

type Pref = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; value: boolean };

const INITIAL: Pref[] = [
  { key: 'notifications', icon: 'notifications-outline', label: 'Notifications', sub: 'Harvest & sync updates', value: true },
  { key: 'autoSync', icon: 'sync-outline', label: 'Auto-sync', sub: 'Refresh sensor data automatically', value: true },
  { key: 'powerAlerts', icon: 'warning-outline', label: 'Power alerts', sub: 'Notify on low battery', value: false },
  { key: 'haptics', icon: 'finger-print-outline', label: 'Haptic feedback', sub: 'Vibrate on tile press', value: true },
];

export default function PreferencesScreen() {
  const { colors: c, fonts: f, mode, toggleMode, fontSize, setFontSize, fs } = useTheme();
  const router = useRouter();
  const [prefs, setPrefs] = useState(INITIAL);

  const toggle = (key: string) =>
    setPrefs((prev) => prev.map((p) => (p.key === key ? { ...p, value: !p.value } : p)));

  return (
    <ScreenShell title="Preferences" showBack>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>APPEARANCE</Text>
        <View style={[styles.themeRow, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={[styles.themeIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={18} color={c.onAccentSoft} />
          </View>
          <View style={styles.text}>
            <Text style={[styles.label, { color: c.text, fontFamily: f.semibold }]}>
              {mode === 'dark' ? 'Dark mode' : 'Light mode'}
            </Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: f.regular }]}>
              {mode === 'dark' ? 'Easy on the eyes at night' : 'Bright and clear during the day'}
            </Text>
          </View>
          <Switch
            value={mode === 'dark'}
            onValueChange={toggleMode}
            accessibilityLabel="Toggle dark mode"
            trackColor={{ false: c.line, true: c.accent }}
            thumbColor={mode === 'dark' ? c.onAccent : '#FFFFFF'}
            ios_backgroundColor={c.line}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>TEXT SIZE</Text>
        <View style={styles.sizeRow}>
          {FONT_SIZE_OPTIONS.map((o) => {
            const active = fontSize === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => setFontSize(o.value as FontSizeOption)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${o.label}, ${o.hint}`}
                style={[
                  styles.sizeCard,
                  {
                    backgroundColor: active ? c.accent : c.surface,
                    borderColor: active ? c.accent : c.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sizePreview,
                    {
                      color: active ? c.onAccent : c.text,
                      fontFamily: f.bold,
                      fontSize: o.value >= 18 ? o.value : fs(o.value),
                    },
                  ]}
                >
                  Ag
                </Text>
                <Text
                  style={[
                    styles.modeLabel,
                    { color: active ? c.onAccent : c.text, fontFamily: active ? f.bold : f.semibold },
                  ]}
                >
                  {o.label}
                </Text>
                <Text
                  style={[
                    styles.modeSub,
                    { color: active ? c.onAccent : c.muted, opacity: active ? 0.85 : 1, fontFamily: f.regular },
                  ]}
                >
                  {o.value}px
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.previewBox, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={{ color: c.text, fontFamily: f.regular, fontSize: fs(14), lineHeight: fs(14) * 1.5 }}>
            Body text renders at {fontSize}px. Headings stay fixed so hierarchy is preserved.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>NOTIFICATIONS</Text>
        <Pressable
          onPress={() => router.push('/pages/notification-sounds')}
          accessibilityRole="button"
          accessibilityLabel="Choose notification sounds"
          style={({ pressed }) => [
            styles.soundLink,
            {
              backgroundColor: c.surface,
              borderColor: c.line,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={[styles.soundLinkIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="musical-notes-outline" size={18} color={c.onAccentSoft} />
          </View>
          <View style={styles.text}>
            <Text style={[styles.label, { color: c.text, fontFamily: f.semibold }]}>
              Choose notification sounds
            </Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: f.regular }]}>
              Set different tones for emergencies and other notifications
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>GENERAL PREFERENCES</Text>
        {prefs.map((p) => (
          <View key={p.key} style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
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
              trackColor={{ false: c.line, true: c.accent }}
              thumbColor={p.value ? c.accent : '#FFFFFF'}
              ios_backgroundColor={c.line}
            />
          </View>
        ))}
      </View>
      <Text style={[styles.hint, { color: c.muted, fontFamily: f.regular }]}>
        Theme and text size are saved on this device and applied across the whole app.
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 2 },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 8,
  },
  modeLabel: { fontSize: 14 },
  modeSub: { fontSize: 10, lineHeight: 14 },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    minHeight: 62,
  },
  themeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  sizeRow: { flexDirection: 'row', gap: 10 },
  sizeCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  sizePreview: { lineHeight: 30 },
  soundLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    minHeight: 62,
  },
  soundLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBox: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    minHeight: 62,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  text: { flex: 1 },
  label: { fontSize: 12 },
  sub: { fontSize: 10, marginTop: 2 },
  hint: { fontSize: 10, textAlign: 'center', marginTop: 4 },
});
