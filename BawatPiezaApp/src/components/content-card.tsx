import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/**
 * ContentCard — reusable themed card wrapper with soft shadow and Poppins type.
 */
export type ContentCardProps = {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: View['props']['style'];
};

export function ContentCard({ title, eyebrow, action, children, style }: ContentCardProps) {
  const { colors: c, fonts: f } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]}>
      {(title || eyebrow || action) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { color: c.muted, fontFamily: f.semibold }]}>{eyebrow}</Text>
            ) : null}
            {title ? <Text style={[styles.title, { color: c.text, fontFamily: f.extrabold }]}>{title}</Text> : null}
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
    borderRadius: 18,
    borderWidth: 1,
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
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
  },
});