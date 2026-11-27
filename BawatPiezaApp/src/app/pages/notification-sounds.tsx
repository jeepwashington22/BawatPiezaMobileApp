import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppText as Text } from '../../components/app-text';
import { ScreenShell } from '../../components/screen-shell';
import { supabase } from '../../lib/supabase';
import {
  applyNotificationSoundPreferences,
  DEFAULT_NOTIFICATION_SOUND_PREFERENCES,
  fetchNotificationSoundPreferences,
  NOTIFICATION_SOUND_OPTIONS,
  saveNotificationSoundPreferences,
  supportsCustomNotificationSounds,
  type NotificationSoundId,
  type NotificationSoundPreferences,
} from '../../lib/push-notifications';
import { useTheme } from '../../theme';

const SOUND_PREVIEW_ASSETS: Record<NotificationSoundId, number | null> = {
  system: null,
  bell_notification: require('../../../assets/sounds/bell_notification.wav'),
  clear_announce_tones: require('../../../assets/sounds/clear_announce_tones.wav'),
  confirmation_tone: require('../../../assets/sounds/confirmation_tone.wav'),
  correct_tone: require('../../../assets/sounds/correct_tone.wav'),
  default_tone: require('../../../assets/sounds/default_tone.wav'),
  emergency: require('../../../assets/sounds/emergency.wav'),
  option_preference_tone: require('../../../assets/sounds/option_preference_tone.wav'),
  wrong_answer_fail: require('../../../assets/sounds/wrong_answer_fail.wav'),
};

export default function NotificationSoundsScreen() {
  const { colors: c, fonts: f } = useTheme();
  const [preferences, setPreferences] = useState(DEFAULT_NOTIFICATION_SOUND_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof NotificationSoundPreferences | null>(null);
  const player = useAudioPlayer(SOUND_PREVIEW_ASSETS[preferences.default]);
  const playerStatus = useAudioPlayerStatus(player);
  const selectedDefaultSound = NOTIFICATION_SOUND_OPTIONS.default.find(
    (option) => option.id === preferences.default,
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error('Sign in to load notification sound preferences.');
      const saved = await fetchNotificationSoundPreferences(accessToken);
      if (!active) return;
      const fixedPreferences = { ...saved, emergency: DEFAULT_NOTIFICATION_SOUND_PREFERENCES.emergency };
      setPreferences(fixedPreferences);
      await applyNotificationSoundPreferences(fixedPreferences);
    })()
      .catch((error: unknown) => {
        if (active) {
          Alert.alert(
            'Sound preferences unavailable',
            error instanceof Error ? error.message : 'Could not load your sound preferences.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chooseSound = async (
    sound: NotificationSoundId,
  ) => {
    if (saving || loading || preferences.default === sound) return;
    player.pause();
    setSaving('default');
    const updated = {
      ...preferences,
      emergency: DEFAULT_NOTIFICATION_SOUND_PREFERENCES.emergency,
      default: sound,
    };
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error('Sign in to save notification sound preferences.');
      await saveNotificationSoundPreferences(accessToken, updated);
      await applyNotificationSoundPreferences(updated);
      setPreferences(updated);
    } catch (error) {
      Alert.alert(
        'Could not save sound preference',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(null);
    }
  };

  const togglePreview = async () => {
    if (preferences.default === 'system') {
      Alert.alert('Preview unavailable', 'The system notification sound cannot be previewed in the app.');
      return;
    }
    try {
      if (playerStatus.playing) {
        player.pause();
        await player.seekTo(0);
        return;
      }
      await player.seekTo(0);
      player.play();
    } catch (error) {
      Alert.alert(
        'Could not play sound',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const renderChoices = () => (
    <View style={styles.choices}>
      {NOTIFICATION_SOUND_OPTIONS.default.map((option) => {
        const selected = preferences.default === option.id;
        const canPreview = selected && SOUND_PREVIEW_ASSETS[option.id] !== null;
        return (
          <View
            key={option.id}
            style={[
              styles.choice,
              {
                backgroundColor: c.surface,
                borderColor: selected ? c.accent : c.line,
                opacity: loading || saving !== null ? 0.65 : 1,
              },
            ]}
          >
            <Pressable
              onPress={() => void chooseSound(option.id)}
              disabled={loading || saving !== null}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: loading || saving !== null }}
              accessibilityLabel={`${option.label}: ${option.description}`}
              style={styles.choiceSelect}
            >
              <View style={[styles.choiceIcon, { backgroundColor: c.accentSoft }]}>
                <Ionicons name="musical-note-outline" size={17} color={c.onAccentSoft} />
              </View>
              <View style={styles.choiceText}>
                <Text style={[styles.label, { color: c.text, fontFamily: f.semibold }]}>
                  {option.label}
                </Text>
                <Text style={[styles.description, { color: c.muted, fontFamily: f.regular }]}>
                  {option.description}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={19}
                color={selected ? c.accent : c.muted}
              />
            </Pressable>
            {canPreview && (
              <Pressable
                onPress={() => void togglePreview()}
                accessibilityRole="button"
                accessibilityLabel={`${playerStatus.playing ? 'Stop' : 'Play'} ${option.label} preview`}
                style={({ pressed }) => [
                  styles.previewButton,
                  { backgroundColor: pressed ? c.accentSoft : c.surfaceMuted },
                ]}
              >
                <Ionicons
                  name={playerStatus.playing ? 'stop' : 'play'}
                  size={17}
                  color={c.accent}
                />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );

  return (
    <ScreenShell title="Notification sounds" showBack>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>PERSONALIZE</Text>
        <Text style={[styles.intro, { color: c.muted, fontFamily: f.regular }]}>
          Emergency alerts always use the fixed emergency tone. Choose and preview the sound for regular notifications.
        </Text>
        {!supportsCustomNotificationSounds && (
          <View style={[styles.noticeCard, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Ionicons name="information-circle-outline" size={17} color={c.accent} />
            <Text style={[styles.notice, { color: c.muted, fontFamily: f.regular }]}>
            Expo Go uses the system notification sound. Custom tones work in a rebuilt app.
            </Text>
          </View>
        )}
        {loading ? (
          <View style={[styles.loading, { backgroundColor: c.surface, borderColor: c.line }]}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={[styles.description, { color: c.muted, fontFamily: f.regular }]}>
              Loading your saved choices…
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>
                  Emergency alerts
                </Text>
              </View>
              <View style={[styles.choice, styles.fixedChoice, { backgroundColor: c.surface, borderColor: c.line }]}>
                <View style={[styles.choiceIcon, { backgroundColor: c.accentSoft }]}>
                  <Ionicons name="warning-outline" size={17} color={c.onAccentSoft} />
                </View>
                <View style={styles.choiceText}>
                  <Text style={[styles.label, { color: c.text, fontFamily: f.semibold }]}>
                    Emergency tone
                  </Text>
                  <Text style={[styles.description, { color: c.muted, fontFamily: f.regular }]}>
                    Fixed sound for emergency alerts
                  </Text>
                </View>
                <Ionicons name="lock-closed-outline" size={17} color={c.muted} />
              </View>
            </View>
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={[styles.sectionTitle, { color: c.muted, fontFamily: f.extrabold }]}>
                  Default notifications
                </Text>
                {saving === 'default' ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Text style={[styles.selectedSound, { color: c.muted, fontFamily: f.medium }]}>
                    {selectedDefaultSound?.label ?? 'Selected sound'}
                  </Text>
                )}
              </View>
              {renderChoices()}
              {preferences.default === 'system' && (
                <Text style={[styles.previewHint, { color: c.muted, fontFamily: f.regular }]}>
                  The system default sound cannot be previewed in the app.
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  notice: { flex: 1, fontSize: 10, lineHeight: 16 },
  choices: { gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 62,
  },
  choiceSelect: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fixedChoice: { gap: 10 },
  previewButton: {
    width: 34,
    height: 34,
    marginLeft: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1 },
  label: { fontSize: 12 },
  description: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  selectedSound: { fontSize: 10 },
  previewHint: { fontSize: 10, marginTop: 8, marginLeft: 2 },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    borderWidth: 1,
    borderRadius: 16,
  },
});
