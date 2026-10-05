import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell } from '../../components/screen-shell';
import { TopBar } from '../../components/top-bar';
import { HeroGlow } from '../../components/hero-glow';
import { scale } from '../../components/glass-ui';
import { fonts, useTheme, type ThemeColors } from '../../theme';

type ThresholdKey = 'floor' | 'degradation' | 'watchWindow';
type Thresholds = Record<ThresholdKey, string>;

type ThresholdDefinition = {
  key: ThresholdKey;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  unit: string;
};

const DEFINITIONS: ThresholdDefinition[] = [
  {
    key: 'floor',
    icon: 'speedometer-outline',
    label: 'Tile Inspection Floor',
    description: 'Tiles below this value are flagged as critical',
    unit: 'J/step',
  },
  {
    key: 'degradation',
    icon: 'trending-down-outline',
    label: 'Degradation Assumption',
    description: 'Used to project the Watch List timeline',
    unit: 'J/week',
  },
  {
    key: 'watchWindow',
    icon: 'eye-outline',
    label: 'Watch List Window',
    description: 'Only tiles projected to cross the floor within this window are surfaced',
    unit: 'days',
  },
];

const INITIAL_THRESHOLDS: Thresholds = {
  floor: '2.0',
  degradation: '0.05',
  watchWindow: '60',
};

export default function ThresholdsScreen() {
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  const [thresholds, setThresholds] = useState<Thresholds>(INITIAL_THRESHOLDS);
  const [draft, setDraft] = useState<Thresholds>(INITIAL_THRESHOLDS);
  const [editing, setEditing] = useState<ThresholdKey | null>(null);

  const openEditor = () => {
    setDraft(thresholds);
    setEditing('floor');
  };

  const confirm = () => {
    setThresholds({
      floor: draft.floor || INITIAL_THRESHOLDS.floor,
      degradation: draft.degradation || INITIAL_THRESHOLDS.degradation,
      watchWindow: draft.watchWindow || INITIAL_THRESHOLDS.watchWindow,
    });
    setEditing(null);
  };

  const updateDraft = (key: ThresholdKey, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <ScreenShell scroll>
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={0.9} bleedBottom={scale(34)} />
        <TopBar gutter={0} title="System Thresholds" showBack glass />
        <View style={styles.heroBody}>
          <View style={styles.heroIcon}>
            <Ionicons name="options-outline" size={scale(21)} color={mode === 'dark' ? '#FFFFFF' : '#C2410C'} />
          </View>
          <Text style={[styles.heroTitle, { color: mode === 'dark' ? '#FFFFFF' : '#2B1205' }]}>System Thresholds</Text>
          <Text style={[styles.heroDescription, { color: mode === 'dark' ? 'rgba(255,255,255,0.72)' : 'rgba(43,18,5,0.66)' }]}>Tune the rules that shape inspection alerts and Watch List projections.</Text>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <Ionicons name="pulse-outline" size={scale(18)} color={c.ok} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>Rules are active</Text>
          <Text style={styles.statusText}>Applied across every monitored tile</Text>
        </View>
        <View style={styles.activeDot} />
      </View>

      <Text style={styles.sectionLabel}>MONITORING RULES</Text>
      <View style={styles.rulesCard}>
        {DEFINITIONS.map((definition, index) => (
          <View key={definition.key} style={[styles.ruleRow, index === DEFINITIONS.length - 1 ? styles.ruleRowLast : null]}>
            <View style={styles.ruleIcon}>
              <Ionicons name={definition.icon} size={scale(18)} color={c.onAccentSoft} />
            </View>
            <View style={styles.ruleCopy}>
              <Text style={styles.ruleLabel}>{definition.label}</Text>
              <Text style={styles.ruleDescription}>{definition.description}</Text>
            </View>
            <View style={styles.ruleValue}>
              <Text style={styles.valueText}>{thresholds[definition.key]}</Text>
              <Text style={styles.unitText}>{definition.unit}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={scale(17)} color={c.accent} />
        <Text style={styles.infoText}>Changes affect new diagnostics and projections. Existing alerts remain unchanged.</Text>
      </View>

      <Pressable onPress={openEditor} style={styles.editButton}>
        <Ionicons name="create-outline" size={scale(17)} color={c.onAccent} />
        <Text style={styles.editButtonText}>Edit System Thresholds</Text>
      </Pressable>

      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditing(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Edit System Thresholds</Text>
            <Text style={styles.sheetDescription}>These apply system-wide and affect the Diagnostic heatmap flags.</Text>
            {DEFINITIONS.map((definition) => (
              <View key={definition.key} style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{definition.label.toUpperCase()} ({definition.unit.toUpperCase()})</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft[definition.key]}
                    onChangeText={(value) => updateDraft(definition.key, value)}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={styles.input}
                    accessibilityLabel={definition.label}
                  />
                  <Text style={styles.inputUnit}>{definition.unit}</Text>
                </View>
              </View>
            ))}
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setEditing(null)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirm} style={styles.confirmButton}>
                <LinearGradient colors={['#F9A51A', '#F15A24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.confirmGradient}>
                  <Text style={styles.confirmText}>Confirm</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: scale(23), position: 'relative' },
  heroBody: { alignItems: 'center', marginTop: scale(4) },
  heroIcon: { width: scale(42), height: scale(42), borderRadius: scale(15), backgroundColor: 'rgba(255,255,255,0.58)', alignItems: 'center', justifyContent: 'center', marginBottom: scale(7) },
  heroTitle: { fontSize: scale(22), lineHeight: scale(28), fontFamily: fonts.extrabold },
  heroDescription: { maxWidth: scale(280), fontSize: scale(9), lineHeight: scale(14), textAlign: 'center', fontFamily: fonts.medium, marginTop: scale(5) },
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(17), padding: scale(13), marginTop: scale(10), shadowColor: '#0A2A4A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  statusIcon: { width: scale(34), height: scale(34), borderRadius: scale(12), backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: scale(10) },
  statusCopy: { flex: 1 },
  statusTitle: { color: c.text, fontSize: scale(12), fontFamily: fonts.extrabold },
  statusText: { color: c.muted, fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) },
  activeDot: { width: scale(8), height: scale(8), borderRadius: scale(4), backgroundColor: c.ok },
  sectionLabel: { color: c.muted, fontSize: scale(9), letterSpacing: 1.2, fontFamily: fonts.extrabold, marginTop: scale(17), marginBottom: scale(7), marginLeft: scale(2) },
  rulesCard: { backgroundColor: c.surface, borderRadius: scale(19), paddingHorizontal: scale(13), shadowColor: '#0A2A4A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: scale(14), borderBottomWidth: 1, borderBottomColor: c.line, gap: scale(9) },
  ruleRowLast: { borderBottomWidth: 0 },
  ruleIcon: { width: scale(34), height: scale(34), borderRadius: scale(11), backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  ruleCopy: { flex: 1 },
  ruleLabel: { color: c.text, fontSize: scale(11), fontFamily: fonts.extrabold },
  ruleDescription: { color: c.muted, fontSize: scale(8.5), lineHeight: scale(12), fontFamily: fonts.medium, marginTop: scale(2) },
  ruleValue: { alignItems: 'flex-end', minWidth: scale(48) },
  valueText: { color: c.text, fontSize: scale(13), fontFamily: fonts.extrabold },
  unitText: { color: c.muted, fontSize: scale(8), fontFamily: fonts.medium, marginTop: scale(1) },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: scale(7), backgroundColor: c.accentSoft, borderRadius: scale(13), padding: scale(11), marginTop: scale(12) },
  infoText: { flex: 1, color: c.muted, fontSize: scale(8.5), lineHeight: scale(13), fontFamily: fonts.medium },
  editButton: { minHeight: scale(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), backgroundColor: c.accent, borderRadius: scale(14), marginTop: scale(14), marginBottom: scale(12) },
  editButtonText: { color: c.onAccent, fontSize: scale(11), fontFamily: fonts.extrabold },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,15,28,0.48)' },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: scale(26), borderTopRightRadius: scale(26), paddingHorizontal: scale(20), paddingTop: scale(13), paddingBottom: scale(20), shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  sheetHandle: { alignSelf: 'center', width: scale(43), height: scale(4), borderRadius: 4, backgroundColor: c.line, marginBottom: scale(13) },
  sheetTitle: { color: c.text, fontSize: scale(15), fontFamily: fonts.extrabold },
  sheetDescription: { color: c.muted, fontSize: scale(10), lineHeight: scale(15), fontFamily: fonts.medium, marginTop: scale(4), marginBottom: scale(15) },
  fieldGroup: { marginBottom: scale(11) },
  fieldLabel: { color: c.muted, fontSize: scale(8.5), letterSpacing: 0.7, fontFamily: fonts.extrabold, marginBottom: scale(5) },
  inputRow: { minHeight: scale(42), flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(13), paddingHorizontal: scale(14) },
  input: { flex: 1, color: c.text, fontSize: scale(12), fontFamily: fonts.medium, paddingVertical: 0 },
  inputUnit: { color: c.text, fontSize: scale(10), fontFamily: fonts.medium },
  sheetActions: { flexDirection: 'row', gap: scale(9), marginTop: scale(6) },
  cancelButton: { flex: 1, minHeight: scale(43), borderRadius: scale(14), backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: c.text, fontSize: scale(11), fontFamily: fonts.extrabold },
  confirmButton: { flex: 1, minHeight: scale(43), borderRadius: scale(14), overflow: 'hidden' },
  confirmGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold },
});
