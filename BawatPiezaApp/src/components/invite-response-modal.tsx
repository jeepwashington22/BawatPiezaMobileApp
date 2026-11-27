import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText as Text } from './app-text';
import { useTheme } from '../theme';

export type InviteResponseAction = 'accept' | 'decline';
export type InviteResponseStage = 'confirm' | 'processing' | 'success' | 'error';

type InviteResponseModalProps = {
  visible: boolean;
  inviterName: string;
  action: InviteResponseAction;
  stage: InviteResponseStage;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onContinue: () => void;
};

export function InviteResponseModal({
  visible,
  inviterName,
  action,
  stage,
  message,
  onCancel,
  onConfirm,
  onContinue,
}: InviteResponseModalProps) {
  const { colors: c, fonts: f } = useTheme();
  const isAccept = action === 'accept';
  const processing = stage === 'processing';
  const statusColor = stage === 'error' ? c.danger : isAccept ? c.ok : c.danger;
  const title =
    stage === 'confirm'
      ? isAccept
        ? 'Accept shared access?'
        : 'Decline invitation?'
      : stage === 'processing'
        ? isAccept
          ? 'Connecting your shared device'
          : 'Updating invitation'
        : stage === 'success'
          ? isAccept
            ? 'Invitation accepted'
            : 'Invitation declined'
          : 'Could not update invitation';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={processing ? undefined : onCancel}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={processing ? undefined : onCancel}
          accessibilityRole="button"
          accessibilityLabel="Close invitation dialog"
        />
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${statusColor}18` }]}>
            {processing ? (
              <ActivityIndicator size="large" color={c.accent} />
            ) : (
              <Ionicons
                name={
                  stage === 'error'
                    ? 'alert-circle-outline'
                    : stage === 'success'
                      ? 'checkmark-circle-outline'
                      : isAccept
                        ? 'person-add-outline'
                        : 'person-remove-outline'
                }
                size={30}
                color={statusColor}
              />
            )}
          </View>
          <Text style={[styles.title, { color: c.text, fontFamily: f.extrabold }]}>{title}</Text>
          <Text style={[styles.message, { color: c.muted, fontFamily: f.regular }]}>
            {message ??
              (stage === 'confirm'
                ? isAccept
                  ? `${inviterName} invited you to access their shared device. Do you want to accept?`
                  : `Decline ${inviterName}'s shared-access invitation?`
                : stage === 'processing'
                  ? isAccept
                    ? 'Accepting the invitation and loading device access. This may take a moment.'
                    : 'Saving your response. Please wait.'
                  : stage === 'success'
                    ? isAccept
                      ? 'Shared access is active and the device is ready.'
                      : 'Your response has been saved.'
                    : 'Please try again.')}
          </Text>

          {stage === 'confirm' ? (
            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  { borderColor: c.line },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: c.text, fontFamily: f.semibold }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: isAccept ? c.ok : c.danger },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryText, { color: '#FFFFFF', fontFamily: f.bold }]}>
                  {isAccept ? 'Accept' : 'Decline'}
                </Text>
              </Pressable>
            </View>
          ) : processing ? null : (
            <Pressable
              onPress={onContinue}
              style={({ pressed }) => [
                styles.button,
                styles.continueButton,
                { backgroundColor: stage === 'error' ? c.surfaceMuted : c.accent },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.primaryText,
                  { color: stage === 'error' ? c.text : c.onAccent, fontFamily: f.bold },
                ]}
              >
                {stage === 'error' ? 'Close' : isAccept ? 'Continue to device' : 'Done'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
    elevation: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, textAlign: 'center' },
  message: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 22 },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1 },
  primaryText: { fontSize: 13 },
  secondaryText: { fontSize: 13 },
  continueButton: { width: '100%', marginTop: 22 },
  pressed: { opacity: 0.75 },
});
