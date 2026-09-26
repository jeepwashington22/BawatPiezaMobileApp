import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fonts, useTheme } from '../theme';
import { scale } from './glass-ui';

type Override = 'grid' | 'battery' | 'shutdown' | null;

type Props = { visible: boolean; onClose: () => void };

export function QuickOverridesModal({ visible, onClose }: Props) {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [override, setOverride] = React.useState<Override>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.bg }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: c.text }]}>Quick Overrides</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>Tap for all zones · hold to choose which zones.</Text>
          <View style={styles.row}>
            <OverrideButton icon="arrow-back" label="Force Grid" color="#1764B0" active={override === 'grid'} onPress={() => { setOverride('grid'); onClose(); }} />
            <OverrideButton icon="flash" label="Force Battery" color="#F59E0B" active={override === 'battery'} onPress={() => { setOverride('battery'); onClose(); }} />
            <OverrideButton icon="power" label="Shutdown" color="#F97316" active={override === 'shutdown'} onPress={() => { setOverride('shutdown'); onClose(); }} />
          </View>
          <Pressable style={[styles.fullButton, { backgroundColor: c.surface }]} onPress={() => { onClose(); router.push('/pages/power-management'); }}>
            <Text style={[styles.fullText, { color: c.text }]}>Open Full Power Management</Text>
            <Text style={[styles.arrow, { color: c.text }]}>→</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OverrideButton({ icon, label, color, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.overrideButton, active && { borderColor: color, borderWidth: 1 }, pressed && { opacity: 0.75 }]}>
      <View style={[styles.icon, { backgroundColor: `${color}18` }]}><Ionicons name={icon} size={15} color={color} /></View>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,42,74,0.18)' },
  sheet: { borderTopLeftRadius: scale(26), borderTopRightRadius: scale(26), paddingHorizontal: scale(22), paddingTop: scale(12), paddingBottom: scale(24), shadowColor: '#0A2A4A', shadowOpacity: 0.18, shadowRadius: scale(18), shadowOffset: { width: 0, height: -5 }, elevation: 12 },
  handle: { alignSelf: 'center', width: scale(32), height: scale(4), borderRadius: scale(2), backgroundColor: 'rgba(10,42,74,0.08)', marginBottom: scale(15) },
  title: { fontSize: scale(15), fontFamily: fonts.extrabold },
  subtitle: { fontSize: scale(10), fontFamily: fonts.medium, marginTop: scale(2), marginBottom: scale(13) },
  row: { flexDirection: 'row', gap: scale(8), marginBottom: scale(10) },
  overrideButton: { flex: 1, minHeight: scale(82), backgroundColor: '#FFFFFF', borderRadius: scale(14), alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(4) },
  icon: { width: scale(30), height: scale(30), borderRadius: scale(10), alignItems: 'center', justifyContent: 'center', marginBottom: scale(7) },
  buttonText: { color: '#0A2A4A', fontSize: scale(9), fontFamily: fonts.extrabold, textAlign: 'center' },
  fullButton: { minHeight: scale(52), borderRadius: scale(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8) },
  fullText: { fontSize: scale(11), fontFamily: fonts.extrabold },
  arrow: { fontSize: scale(17), fontFamily: fonts.bold },
});
