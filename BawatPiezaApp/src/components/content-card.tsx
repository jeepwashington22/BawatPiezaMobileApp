import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * ContentCard — reusable card wrapper mirroring the web dashboard's surface
 * cards (white/translucent panel, rounded corners, hairline border, soft shadow).
 */
export type ContentCardProps = {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: View['props']['style'];
};

export function ContentCard({ title, eyebrow, action, children, style }: ContentCardProps) {
  return (
    <View style={[styles.card, style]}>
      {(title || eyebrow || action) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            {title ? <Text style={styles.title}>{title}</Text> : null}
          </View>
          {action ?? null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(10, 42, 74, 0.1)',
    padding: 18,
    marginBottom: 16,
    shadowColor: 'rgba(10, 42, 74, 0.08)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerText: { flex: 1, paddingRight: 8 },
  eyebrow: {
    color: 'rgba(10, 42, 74, 0.42)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: 2,
  },
  title: {
    color: '#0A2A4A',
    fontSize: 16,
    fontWeight: '800',
  },
});