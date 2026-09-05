import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';

const MUTED = 'rgba(10, 42, 74, 0.62)';
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Same month builder as web schedule page (Monday-first)
function buildMonth(date: Date): (number | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function ScheduleScreen() {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const BUTTER = c.butter;
  const MUTED = c.muted;
  const LINE = c.line;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  const OK = c.ok;
  const BAD = c.danger;
  const today = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<number>(today.getDate());
  const [operatingDays, setOperatingDays] = useState<boolean[]>([true, true, true, true, true, false, false]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading schedule" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const monthCells = buildMonth(monthCursor);
  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isThisMonth =
    monthCursor.getMonth() === today.getMonth() && monthCursor.getFullYear() === today.getFullYear();

  function shiftMonth(delta: number) {
    setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1));
  }
  function toggleDay(i: number) {
    setOperatingDays((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <ScreenShell>
      <ContentCard
        title={monthLabel}
        eyebrow="Availability Calendar"
        action={
          <View style={styles.monthNav}>
            <Pressable style={styles.navBtn} onPress={() => shiftMonth(-1)} hitSlop={6}>
              <Text style={styles.navBtnText}>‹</Text>
            </Pressable>
            <Pressable style={styles.navBtn} onPress={() => shiftMonth(1)} hitSlop={6}>
              <Text style={styles.navBtnText}>›</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.weekRow}>
          {DAY_LABELS.map((d, i) => (
            <Text key={i} style={styles.dayLabel}>{d}</Text>
          ))}
        </View>
        <View style={styles.calGrid}>
          {monthCells.map((d, i) => {
            const isToday = isThisMonth && d === today.getDate();
            const isSelected = isThisMonth && d === selectedDate;
            return (
              <Pressable
                key={i}
                disabled={d === null}
                onPress={() => d !== null && setSelectedDate(d)}
                style={[styles.calCell, isToday && styles.calToday, isSelected && !isToday && styles.calSelected]}
              >
                <Text style={[styles.calText, isToday && styles.calTextToday]}>{d ?? ''}</Text>
              </Pressable>
            );
          })}
        </View>
      </ContentCard>

      <ContentCard eyebrow="Weekly">
        <View style={styles.weekRow}>
          {operatingDays.map((on, i) => (
            <Pressable
              key={i}
              onPress={() => toggleDay(i)}
              style={[styles.dayToggle, on && styles.dayToggleOn]}
              accessibilityRole="button"
            >
              <Text style={[styles.dayToggleText, on && styles.dayToggleTextOn]}>{DAY_LABELS[i]}</Text>
            </Pressable>
          ))}
        </View>
      </ContentCard>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  return StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  monthNav: { flexDirection: 'row', gap: 8 },
  navBtn: {
    width: 30, height: 30, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(10, 42, 74, 0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText: { color: PRUSSIAN, fontSize: 18, fontWeight: '800', fontFamily: fonts.extrabold, lineHeight: 20 },
  weekRow: { flexDirection: 'row', gap: 4 },
  dayLabel: { flex: 1, textAlign: 'center', color: MUTED, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  calCell: {
    width: '13%', aspectRatio: 1, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  calToday: { backgroundColor: PRUSSIAN },
  calSelected: { borderWidth: 2, borderColor: BUTTER },
  calText: { color: PRUSSIAN, fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold },
  calTextToday: { color: WHITE, fontWeight: '800', fontFamily: fonts.extrabold },
  dayToggle: {
    flex: 1, aspectRatio: 1, borderRadius: 12, maxWidth: 44,
    borderWidth: 1, borderColor: 'rgba(10, 42, 74, 0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  dayToggleOn: { backgroundColor: PRUSSIAN, borderColor: PRUSSIAN },
  dayToggleText: { color: MUTED, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
  dayToggleTextOn: { color: WHITE },
  });
};



