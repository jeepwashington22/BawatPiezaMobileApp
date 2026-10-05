import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { ScreenShell } from '../../components/screen-shell';
import { TopBar } from '../../components/top-bar';
import { HeroGlow } from '../../components/hero-glow';
import { scale } from '../../components/glass-ui';
import { fonts, useTheme, type ThemeColors } from '../../theme';

const DAY_LABELS = ['M', 'T', 'W', 'Th', 'F', 'S', 'S'];
const TIME_OPTIONS = ['6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];

type ScreenStyles = ReturnType<typeof makeStyles>;

export default function ScheduleScreen() {
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  const params = useLocalSearchParams<{ name?: string }>();
  const zoneName = params.name || '1F Room 101 - Right Wing';
  const [operatingDays, setOperatingDays] = useState([true, true, true, true, true, false, false]);
  const [lightsOn, setLightsOn] = useState('6:00 PM');
  const [lightsOff, setLightsOff] = useState('6:00 AM');
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [priority, setPriority] = useState('High');
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [saved, setSaved] = useState(false);

  const heroInk = mode === 'dark' ? '#FFFFFF' : '#2B1205';
  const heroSoft = mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(43,18,5,0.66)';
  const cycleTime = (value: string, setValue: (next: string) => void) => {
    const index = TIME_OPTIONS.indexOf(value);
    setValue(TIME_OPTIONS[(index + 1) % TIME_OPTIONS.length]);
  };

  return (
    <ScreenShell scroll>
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={1} bleedBottom={scale(30)} />
        <TopBar gutter={0} title="Scheduling" showBack glass />
        <View style={styles.heroBody}>
          <Text style={[styles.heroEyebrow, { color: heroSoft }]}>ZONE</Text>
          <Text style={[styles.heroTitle, { color: heroInk }]}>Scheduling</Text>
        </View>
      </View>

      <View style={styles.zoneCard}>
        <Text style={styles.zoneName}>{zoneName}</Text>
        <Text style={styles.zoneSub}>Custom schedule, priority &amp; power source</Text>
      </View>

      <SectionLabel text="OPERATING DAYS" c={c} />
      <View style={styles.card}>
        <Text style={styles.caption}>Which days this schedule applies</Text>
        <View style={styles.daysRow}>
          {DAY_LABELS.map((day, index) => (
            <Pressable
              key={`${day}-${index}`}
              accessibilityLabel={`${day} operating day`}
              onPress={() => setOperatingDays((current) => current.map((on, i) => i === index ? !on : on))}
              style={[styles.dayButton, operatingDays[index] ? styles.dayButtonActive : null]}
            >
              <Text style={[styles.dayText, operatingDays[index] ? styles.dayTextActive : null]}>{day}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <SectionLabel text="OPERATING HOURS" c={c} />
        <Text style={styles.tapHint}>Tap to change</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.caption}>Custom ON/OFF window for this zone</Text>
        <View style={styles.timeRow}>
          <TimeBox label="LIGHTS ON" value={lightsOn} onPress={() => cycleTime(lightsOn, setLightsOn)} styles={styles} />
          <Ionicons name="arrow-forward" size={scale(14)} color={c.muted} />
          <TimeBox label="LIGHTS OFF" value={lightsOff} onPress={() => cycleTime(lightsOff, setLightsOff)} styles={styles} />
        </View>
        <ToggleRow label="Always On" sublabel="Ignore schedule, stay lit 24/7" value={alwaysOn} onPress={() => setAlwaysOn((current) => !current)} styles={styles} />
      </View>

      <SectionLabel text="PRIORITY LEVEL" c={c} />
      <View style={styles.priorityRow}>
        {['Low', 'Medium', 'High'].map((item) => (
          <Pressable key={item} onPress={() => setPriority(item)} style={[styles.priorityButton, priority === item ? styles.priorityActive : null]}>
            <Text style={[styles.priorityText, priority === item ? styles.priorityTextActive : null]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.cardCompact}>
        <ToggleRow label="Follow Auto-Switch" sublabel="Let the system pick source automatically" value={autoSwitch} onPress={() => setAutoSwitch((current) => !current)} styles={styles} />
      </View>

      <Pressable onPress={() => setSaved(true)}>
        <LinearGradient colors={['#F9A51A', '#F15A24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveButton}>
          <Text style={styles.saveText}>{saved ? 'Zone Settings Saved' : 'Save Zone Settings'}</Text>
        </LinearGradient>
      </Pressable>
    </ScreenShell>
  );
}

function SectionLabel({ text, c }: { text: string; c: ThemeColors }) {
  return <Text style={{ color: c.muted, fontSize: scale(10), letterSpacing: 1.1, fontFamily: fonts.extrabold, marginTop: scale(13), marginBottom: scale(7) }}>{text}</Text>;
}

function TimeBox({ label, value, onPress, styles }: { label: string; value: string; onPress: () => void; styles: ScreenStyles }) {
  return <Pressable onPress={onPress} style={styles.timeBox}><Text style={styles.timeLabel}>{label}</Text><Text style={styles.timeValue}>{value}</Text></Pressable>;
}

function ToggleRow({ label, sublabel, value, onPress, styles }: { label: string; sublabel: string; value: boolean; onPress: () => void; styles: ScreenStyles }) {
  return <View style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.toggleSub}>{sublabel}</Text></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={[styles.toggle, value ? styles.toggleOn : null]}><View style={[styles.toggleThumb, value ? styles.toggleThumbOn : null]} /></Pressable></View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: scale(22), position: 'relative' },
  heroBody: { alignItems: 'center', marginTop: scale(2) },
  heroEyebrow: { fontSize: scale(9), letterSpacing: 1.3, fontFamily: fonts.extrabold },
  heroTitle: { fontSize: scale(22), lineHeight: scale(28), fontFamily: fonts.extrabold, marginTop: scale(2) },
  zoneCard: { alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(18), paddingVertical: scale(16), paddingHorizontal: scale(12), marginTop: scale(9), shadowColor: '#0A2A4A', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  zoneName: { color: c.text, fontSize: scale(12), fontFamily: fonts.extrabold, textAlign: 'center' },
  zoneSub: { color: c.muted, fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(4), textAlign: 'center' },
  card: { backgroundColor: c.surface, borderRadius: scale(18), padding: scale(13), shadowColor: '#0A2A4A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardCompact: { backgroundColor: c.surface, borderRadius: scale(17), paddingHorizontal: scale(13), paddingVertical: scale(5), marginTop: scale(13) },
  caption: { color: c.muted, fontSize: scale(9), fontFamily: fonts.medium, marginBottom: scale(10) },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', gap: scale(5) },
  dayButton: { flex: 1, height: scale(27), borderRadius: scale(14), alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, borderWidth: 1, borderColor: c.line },
  dayButtonActive: { backgroundColor: '#0B55A1', borderColor: '#0B55A1' },
  dayText: { color: c.muted, fontSize: scale(9), fontFamily: fonts.extrabold },
  dayTextActive: { color: '#FFFFFF' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tapHint: { color: c.muted, fontSize: scale(8), fontFamily: fonts.extrabold, marginTop: scale(13) },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: scale(9) },
  timeBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: scale(55), borderRadius: scale(12), backgroundColor: c.bg },
  timeLabel: { color: c.muted, fontSize: scale(7.5), fontFamily: fonts.extrabold },
  timeValue: { color: c.text, fontSize: scale(15), fontFamily: fonts.extrabold, marginTop: scale(3) },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: scale(5) },
  toggleCopy: { flex: 1 },
  toggleLabel: { color: c.text, fontSize: scale(10), fontFamily: fonts.extrabold },
  toggleSub: { color: c.muted, fontSize: scale(8), fontFamily: fonts.medium, marginTop: scale(2) },
  toggle: { width: scale(36), height: scale(22), borderRadius: scale(12), backgroundColor: c.line, padding: scale(3), justifyContent: 'center' },
  toggleOn: { backgroundColor: '#0B55A1' },
  toggleThumb: { width: scale(16), height: scale(16), borderRadius: scale(8), backgroundColor: '#FFFFFF' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  priorityRow: { flexDirection: 'row', gap: scale(8) },
  priorityButton: { flex: 1, minHeight: scale(42), borderRadius: scale(22), backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  priorityActive: { backgroundColor: '#0B55A1' },
  priorityText: { color: c.muted, fontSize: scale(10), fontFamily: fonts.extrabold },
  priorityTextActive: { color: '#FFFFFF' },
  saveButton: { minHeight: scale(44), borderRadius: scale(13), alignItems: 'center', justifyContent: 'center', marginTop: scale(16), marginBottom: scale(10), shadowColor: '#F15A24', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  saveText: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold },
});
