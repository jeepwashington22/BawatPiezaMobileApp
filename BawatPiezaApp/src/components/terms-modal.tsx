import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../theme';
import { useTermsReading } from '../hooks/use-terms-reading';
import {
  TERMS_AGREEMENT_LABEL,
  TERMS_INTRO,
  TERMS_SECTIONS,
  TERMS_SUBTITLE,
  TERMS_TITLE,
  TERMS_UPDATED,
  TERMS_VERSION,
} from '../constants/terms';

export type TermsModalProps = {
  visible: boolean;
  /** Fired with the acceptance timestamp (ISO 8601) once the user ticks the box and confirms. */
  onAccept: (acceptedAt: string) => void;
  /** Fired when the user closes the policy without agreeing. */
  onDecline: () => void;
  /** Light surface (signup screen) or dark surface (login screen). */
  variant?: 'light' | 'dark';
  confirmLabel?: string;
  /** Shows a spinner on the confirm button while the account request is in flight. */
  busy?: boolean;
  /** Require the reader to reach the end of the policy before the checkbox unlocks. */
  requireScroll?: boolean;
};

/**
 * Terms & Conditions gate shown before an account is created.
 *
 * Account creation must not proceed until the user has read the policy to the
 * end, ticked the agreement checkbox, and confirmed. Works for every sign-up
 * path (email + password and Google Sign-In alike) because it is driven from
 * the caller's submit handlers.
 */
export function TermsModal({
  visible,
  onAccept,
  onDecline,
  variant = 'light',
  confirmLabel = 'I Agree & Continue',
  busy = false,
  requireScroll = true,
}: TermsModalProps) {
  const dark = variant === 'dark';
  const styles = useMemo(() => makeStyles(dark), [dark]);

  const [checked, setChecked] = useState(false);
  const { reachedEnd, reset, onLayout, onContentSizeChange, onScroll } =
    useTermsReading(requireScroll);

  // Always start a fresh, explicit agreement each time the policy is opened.
  // `reset` is stable, so this effect only re-runs when the modal reopens.
  useEffect(() => {
    if (!visible) return;
    setChecked(false);
    reset();
  }, [visible, reset]);

  // The agreement is recorded automatically the moment the reader reaches the
  // end of the policy - no second tap is required.
  useEffect(() => {
    if (reachedEnd) setChecked(true);
  }, [reachedEnd]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="document-text-outline" size={20} color={dark ? '#F6C445' : '#0A2A4A'} />
            </View>
            <Text style={styles.title}>{TERMS_TITLE}</Text>
            <Text style={styles.subtitle}>{TERMS_SUBTITLE}</Text>
            <Text style={styles.meta}>
              Version {TERMS_VERSION} · Last updated {TERMS_UPDATED}
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            onLayout={onLayout}
            onContentSizeChange={onContentSizeChange}
            onScroll={onScroll}
            scrollEventThrottle={32}
            showsVerticalScrollIndicator
          >
            <Text style={styles.intro}>{TERMS_INTRO}</Text>

            {TERMS_SECTIONS.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                {section.body.map((paragraph) => (
                  <Text key={paragraph.slice(0, 40)} style={styles.paragraph}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            ))}

            <Text style={styles.endMarker}>— End of {TERMS_TITLE} —</Text>
          </ScrollView>

          <View style={styles.footer}>
            {/* Ticked by reading to the end, not by tapping. */}
            <View style={styles.checkRow}>
              <View
                style={[styles.checkbox, checked ? styles.checkboxChecked : styles.checkboxLocked]}
              >
                {checked ? (
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-down" size={13} color={dark ? '#F6C445' : '#0A2A4A'} />
                )}
              </View>
              <Text style={[styles.checkLabel, !checked && styles.checkLabelLocked]}>
                {checked
                  ? TERMS_AGREEMENT_LABEL
                  : 'Scroll to the end of the policy to record your agreement.'}
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={onDecline}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.declineText}>Not now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptButton, !checked && styles.acceptButtonDisabled]}
                onPress={() => onAccept(new Date().toISOString())}
                activeOpacity={0.9}
                disabled={!checked || busy}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color={dark ? '#0A2A4A' : '#FFFFFF'} size="small" />
                ) : (
                  <Text style={styles.acceptText}>{confirmLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(dark: boolean) {
  const sheet = dark ? '#0F1F33' : '#FFFFFF';
  const title = dark ? '#FFFFFF' : '#0A2A4A';
  const body = dark ? 'rgba(255,255,255,0.82)' : 'rgba(10,42,74,0.82)';
  const muted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(10,42,74,0.5)';
  const heading = dark ? '#F6C445' : '#0A2A4A';
  const line = dark ? 'rgba(255,255,255,0.14)' : 'rgba(10,42,74,0.14)';
  const accent = dark ? '#F6C445' : '#0A2A4A';
  const onAccent = dark ? '#0A2A4A' : '#FFFFFF';

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '90%',
      backgroundColor: sheet,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: line,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    header: {
      flexShrink: 0,
      alignItems: 'center',
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: line,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(246,196,69,0.14)' : 'rgba(10,42,74,0.08)',
      marginBottom: 10,
    },
    title: {
      color: title,
      fontSize: 19,
      fontWeight: '800',
      fontFamily: fonts.extrabold,
      textAlign: 'center',
    },
    subtitle: {
      color: body,
      fontSize: 12,
      fontFamily: fonts.medium,
      marginTop: 4,
      textAlign: 'center',
    },
    meta: {
      color: muted,
      fontSize: 11,
      fontFamily: fonts.regular,
      marginTop: 6,
      textAlign: 'center',
    },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingHorizontal: 20, paddingVertical: 16 },
    intro: {
      color: body,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: fonts.regular,
      marginBottom: 16,
    },
    section: { marginBottom: 16 },
    sectionHeading: {
      color: heading,
      fontSize: 13,
      fontWeight: '800',
      fontFamily: fonts.extrabold,
      marginBottom: 6,
    },
    paragraph: {
      color: body,
      fontSize: 12.5,
      lineHeight: 19,
      fontFamily: fonts.regular,
      marginBottom: 8,
    },
    endMarker: {
      color: muted,
      fontSize: 11,
      fontFamily: fonts.semibold,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 4,
    },
    footer: {
      flexShrink: 0,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 18,
      borderTopWidth: 1,
      borderTopColor: line,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      marginTop: 1,
    },
    checkboxChecked: { backgroundColor: accent, borderColor: accent },
    checkboxLocked: { opacity: 0.35 },
    checkLabel: {
      flex: 1,
      color: body,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: fonts.medium,
    },
    checkLabelLocked: { color: muted },
    actions: { flexDirection: 'row', gap: 10 },
    declineButton: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: line,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    declineText: {
      color: title,
      fontSize: 13,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
    acceptButton: {
      flex: 1.4,
      borderRadius: 14,
      backgroundColor: accent,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acceptButtonDisabled: { opacity: 0.4 },
    acceptText: {
      color: onAccent,
      fontSize: 13,
      fontWeight: '800',
      fontFamily: fonts.extrabold,
    },
  });
}