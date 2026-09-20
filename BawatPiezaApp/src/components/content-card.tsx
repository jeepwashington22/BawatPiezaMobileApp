import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Card, brandAccent, scale } from './glass-ui';

/**
 * ContentCard — premium navy-and-gold card wrapper shared by all pages.
 * Solid surface card with a gold tick + letter-spaced eyebrow (no glass).
 */
export type ContentCardProps = {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: View['props']['style'];
};

export function ContentCard({ title, eyebrow, action, children, style }: ContentCardProps) {
  const { colors: c, mode } = useTheme();
  return (
    <Card mode={mode} style={[styles.card, style]}>
      {(title || eyebrow || action) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow ? (
              <View style={styles.eyebrowRow}>
                <View style={[styles.eyebrowTick, { backgroundColor: brandAccent(mode) }]} />
                <Text style={[styles.eyebrow, { color: mode === 'dark' ? 'rgba(255,255,255,0.60)' : 'rgba(10,42,74,0.55)' }]}>
                  {eyebrow}
                </Text>
              </View>
            ) : null}
            {title ? <Text style={[styles.title, { color: c.text }]}>{title}</Text> : null}
          </View>
          {action ?? null}
        </View>
      )}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: scale(18),
    padding: scale(16),
    marginBottom: scale(14),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(12),
  },
  headerText: { flex: 1, paddingRight: 8 },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: scale(2),
  },
  eyebrowTick: {
    width: scale(3),
    height: scale(11),
    borderRadius: 2,
  },
  eyebrow: {
    fontSize: scale(9),
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: 'Poppins_700Bold',
  },
  title: {
    fontSize: scale(15),
    fontFamily: 'Poppins_800ExtraBold',
  },
});