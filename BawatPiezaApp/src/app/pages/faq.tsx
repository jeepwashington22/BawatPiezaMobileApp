import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenShell } from '../../components/screen-shell';
import { ContentCard } from '../../components/content-card';
import { fonts, useTheme } from '../../theme';

type QA = { q: string; a: string };

const FAQS: QA[] = [
  {
    q: 'What is BawatPieza?',
    a: 'BawatPieza turns foot traffic into electricity. Piezoelectric tiles harvest pressure energy from every step, which is converted, stored and monitored in real time so your space runs on clean, self-generated power.',
  },
  {
    q: 'How do I pair a hub?',
    a: 'Open the Profile tab and go to Device Management, then Connections, and follow the on-screen pairing steps. Keep your phone and the hub on the same network during setup.',
  },
  {
    q: 'What is billing impact?',
    a: 'Billing impact estimates the grid (Meralco) cost you avoided by using harvested energy. It is based on your current electricity rate and the kWh you generated.',
  },
  {
    q: 'How is the electricity rate set?',
    a: 'The rate syncs automatically from the database. You can review it under Profile > Utility & Rates > Electricity Rate.',
  },
  {
    q: 'Why is my hub showing offline?',
    a: 'Check that the hub has power, is within range and that your phone has a stable connection. Pull down on the Profile tab to refresh the connection status.',
  },
  {
    q: 'How do I read my reports?',
    a: 'Open the Reports tab and pick a period. Generation, savings and the power-source mix all update for the selected today, 7-day or 30-day range.',
  },
];

export default function FaqScreen() {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ScreenShell title="FAQ" showBack>
      <Text style={[styles.intro, { color: c.muted }]}>
        Quick answers about setup, power management and billing.
      </Text>

      {FAQS.map((item, index) => {
        const isOpen = open === index;
        return (
          <View key={item.q} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : index)}
              style={styles.qRow}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={item.q}
            >
              <View style={[styles.qIcon, { backgroundColor: 'rgba(249, 115, 22, 0.12)' }]}>
                <Ionicons name="help-circle-outline" size={18} color={c.text} />
              </View>
              <Text style={[styles.q, { color: c.text }]}>{item.q}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
            </Pressable>
            {isOpen ? <Text style={[styles.a, { color: c.muted }]}>{item.a}</Text> : null}
          </View>
        );
      })}

      <ContentCard eyebrow="Still need help?">
        <Text style={[styles.body, { color: c.muted }]}>
          Open the About page for app details, or reach the BawatPieza team from your account settings.
        </Text>
      </ContentCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  q: { flex: 1, fontSize: 12, fontFamily: fonts.extrabold },
  a: { fontSize: 11.5, lineHeight: 17, marginTop: 10, marginLeft: 40, fontFamily: fonts.medium },
  body: { fontSize: 12.5, lineHeight: 19, fontFamily: fonts.regular },
});
