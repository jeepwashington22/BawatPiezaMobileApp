import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fonts } from "../theme";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TermsModal } from "../components/terms-modal";
import {
  supabase,
  signInWithGoogle,
  sendWelcomeEmailIfNew,
  isEmailRegistered,
  isGoogleSignInCancelled,
  describeGoogleSignInError,
  termsAcceptanceMetadata,
} from "../lib/supabase";
import { validateEmail, validateLoginPassword } from "../lib/validation";
import { apiFetch } from "../lib/api";
import {
  issueForHttpStatus,
  classifyNetworkError,
  NETWORK_ISSUE_INFO,
  type NetworkIssue,
} from "../lib/network";

const PRUSSIAN = "#0A2A4A";
const PRUSSIAN_SOFT = "#345271";
const BUTTER = "#F6C445";
const MUTED = "rgba(255, 255, 255, 0.72)";
const LINE = "rgba(255, 255, 255, 0.12)";
const SURFACE = "rgba(15, 23, 36, 0.72)";
const INPUT_BG = "rgba(255, 255, 255, 0.05)";

/** Best-effort device description sent to the backend for security alerts. */
function deviceInfoHeader(): string {
  const os =
    Platform.OS === "android"
      ? "Android"
      : Platform.OS === "ios"
        ? "iOS"
        : "Web";
  const version = Platform.Version ? ` ${Platform.Version}` : "";
  return `${os}${version} - BawatPieza App`;
}

function GmailMark() {
  return (
    <View
      style={{ width: 20, height: 16, position: "relative", marginRight: 2 }}
      accessibilityLabel="Gmail"
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 2,
          width: 4,
          height: 14,
          backgroundColor: "#4285F4",
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 3,
          top: 0,
          width: 9,
          height: 4,
          backgroundColor: "#EA4335",
          transform: [{ rotate: "28deg" }],
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 3,
          top: 0,
          width: 9,
          height: 4,
          backgroundColor: "#FBBC04",
          transform: [{ rotate: "-28deg" }],
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 2,
          width: 4,
          height: 14,
          backgroundColor: "#34A853",
          borderRadius: 1,
        }}
      />
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Terms & Welcome state
  const [termsVisible, setTermsVisible] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const processingRef = useRef(false);

  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpInputs = useRef<Array<TextInput | null>>([]);
  const [netIssue, setNetIssue] = useState<NetworkIssue | null>(null);

  const handleAuthSuccess = async () => {
    try {
      let savedHubId = await AsyncStorage.getItem("bawatpieza_hub_id");

      if (savedHubId) {
        router.replace({ pathname: "/home", params: { hubId: savedHubId } });
      } else {
        router.replace("/provisioning");
      }
    } catch (err) {
      router.replace("/provisioning");
    }
  };

  const processSession = async (session: any) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      // 🛠 DATABASE AUTO-CLEANER:
      // Wipes the fake "Unknown" surname injected by Supabase DB triggers on Google SSO
      if (session?.user?.id) {
        supabase
          .from("user_accounts")
          .update({ lastname: null })
          .eq("id", session.user.id)
          .ilike("lastname", "unknown")
          .then();
      }

      const meta = session?.user?.user_metadata || {};
      const hasAccepted = !!meta.terms_accepted_at;

      // Extract a friendly first name to greet the user
      let fName =
        meta.given_name ||
        meta.firstname ||
        meta.full_name?.split(" ")[0] ||
        "there";
      setWelcomeName(fName);

      if (hasAccepted) {
        await handleAuthSuccess();
      } else {
        setTermsVisible(true);
      }
    } catch (err) {
      processingRef.current = false;
    }
  };

  const handleTermsAccept = async (acceptedAt: string) => {
    setTermsVisible(false);
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const meta = user?.user_metadata || {};

      const familyName = meta.family_name || meta.lastname || "";
      const cleanLastName =
        familyName.toLowerCase() === "unknown" ? null : familyName;

      const { error } = await supabase.auth.updateUser({
        data: {
          ...termsAcceptanceMetadata(acceptedAt),
          lastname: cleanLastName,
          family_name: cleanLastName,
        },
      });
      if (error) throw error;

      setShowWelcomeModal(true);
    } catch (e) {
      setError("Failed to save terms acceptance. Please try again.");
      processingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleTermsDecline = async () => {
    setTermsVisible(false);
    processingRef.current = false;
    await supabase.auth.signOut();
    setError("You must read and accept the Terms & Conditions to use the app.");
  };

  useEffect(() => {
    let authSubscription:
      | ReturnType<
          typeof supabase.auth.onAuthStateChange
        >["data"]["subscription"]
      | null = null;

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          await processSession(session);
          return;
        }

        authSubscription = supabase.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_IN" && session?.user) {
            sendWelcomeEmailIfNew();
            setTimeout(() => {
              void processSession(session);
            }, 200);
          }
        }).data.subscription;
      } catch (err) {
        console.error("LoginScreen: Error checking session:", err);
      }
    };

    initAuth();
    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setInterval(
      () => setResendIn((value) => (value > 0 ? value - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, [resendIn]);

  const apiMessage = (payload: unknown, fallback: string): string => {
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim())
        return record.error;
      if (typeof record.message === "string" && record.message.trim())
        return record.message;
    }
    return fallback;
  };

  const completeSignIn = async (
    accessToken: string,
    refreshToken: string,
  ): Promise<void> => {
    const { error: sessionError, data } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      throw new Error(
        "Sign-in succeeded, but the session could not be started. Please try again.",
      );
    }
    setPassword("");
    setOtp("");

    if (data.session) {
      await processSession(data.session);
    }
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    const validationError =
      validateEmail(trimmedEmail) ?? validateLoginPassword(password);
    if (validationError) {
      setError(validationError);
      setNetIssue(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    setNetIssue(null);

    try {
      const res = await apiFetch("/accounts/2fa/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Info": deviceInfoHeader(),
        },
        body: JSON.stringify({ email: trimmedEmail.toLowerCase(), password }),
        timeoutMs: 15_000,
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!res.ok) {
        const netProblem = issueForHttpStatus(res.status);
        if (netProblem) {
          setNetIssue(netProblem.issue);
          setError(`${netProblem.title}. ${netProblem.message}`);
          return;
        }

        let message = apiMessage(
          json,
          "Unable to sign in right now. Please try again.",
        );

        if (res.status === 401) {
          const registered = await isEmailRegistered(trimmedEmail);
          if (registered === false) {
            message =
              "No account found for this email. Check the address, or create an account first.";
          } else if (registered === true) {
            message = "Incorrect password. Check your password and try again.";
          }
        }

        setError(message);
        return;
      }

      const session = (json?.session ?? null) as {
        access_token?: unknown;
        refresh_token?: unknown;
      } | null;
      const accessToken =
        typeof session?.access_token === "string" ? session.access_token : "";
      const refreshToken =
        typeof session?.refresh_token === "string" ? session.refresh_token : "";

      if (accessToken && refreshToken) {
        await completeSignIn(accessToken, refreshToken);
        return;
      }

      const challenge =
        typeof json?.challengeId === "string" ? json.challengeId : "";
      if (!challenge) {
        setError(
          "Sign-in started, but the server did not send a code. Please try again.",
        );
        return;
      }

      setChallengeId(challenge);
      setOtp("");
      setOtpError(null);
      setInfo(
        apiMessage(
          json,
          `A 6-digit verification code was sent to ${trimmedEmail}.`,
        ),
      );
      setResendIn(60);
      setStep("otp");
    } catch (authError) {
      const issue = classifyNetworkError(authError);
      setNetIssue(issue.issue);
      setError(`${issue.title}. ${issue.message}`);
      Alert.alert(issue.title, issue.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError("Enter the 6-digit code from your email.");
      return;
    }

    setVerifying(true);
    setOtpError(null);

    try {
      const res = await apiFetch("/accounts/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp: code }),
        timeoutMs: 15_000,
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!res.ok) {
        if (res.status === 410) {
          backToCredentials();
          setError(
            apiMessage(
              json,
              "This sign-in attempt has expired. Please sign in again.",
            ),
          );
          return;
        }
        const netProblem = issueForHttpStatus(res.status);
        if (netProblem) {
          setNetIssue(netProblem.issue);
          setOtpError(`${netProblem.title}. ${netProblem.message}`);
          return;
        }
        setOtpError(
          apiMessage(
            json,
            "Unable to verify the code right now. Please try again.",
          ),
        );
        return;
      }

      const session = (json?.session ?? null) as {
        access_token?: unknown;
        refresh_token?: unknown;
      } | null;
      const accessToken =
        typeof session?.access_token === "string" ? session.access_token : "";
      const refreshToken =
        typeof session?.refresh_token === "string" ? session.refresh_token : "";
      if (!accessToken || !refreshToken) {
        setOtpError(
          "The code was accepted, but no session came back. Please sign in again.",
        );
        return;
      }

      await completeSignIn(accessToken, refreshToken);
    } catch (verifyError) {
      const issue = classifyNetworkError(verifyError);
      setNetIssue(issue.issue);
      setOtpError(`${issue.title}. ${issue.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0 || resending) return;
    setResending(true);
    setOtpError(null);

    try {
      const res = await apiFetch("/accounts/2fa/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
        timeoutMs: 15_000,
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!res.ok) {
        if (res.status === 410) {
          backToCredentials();
          setError(
            apiMessage(
              json,
              "This sign-in attempt has expired. Please sign in again.",
            ),
          );
          return;
        }
        const netProblem = issueForHttpStatus(res.status);
        if (netProblem) {
          setNetIssue(netProblem.issue);
          setOtpError(`${netProblem.title}. ${netProblem.message}`);
          return;
        }
        setOtpError(
          apiMessage(json, "Could not resend the code. Please try again."),
        );
        return;
      }

      setOtp("");
      setInfo(apiMessage(json, "A new 6-digit code was sent to your email."));
      setResendIn(60);
    } catch (resendError) {
      const issue = classifyNetworkError(resendError);
      setNetIssue(issue.issue);
      setOtpError(`${issue.title}. ${issue.message}`);
    } finally {
      setResending(false);
    }
  };

  const backToCredentials = () => {
    setStep("credentials");
    setChallengeId("");
    setOtp("");
    setOtpError(null);
    setInfo(null);
    setResendIn(0);
  };

  const handleGoogleSignIn = async () => {
    setGoogleSigningIn(true);
    setError(null);

    try {
      await signInWithGoogle();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        sendWelcomeEmailIfNew();
        await processSession(session);
      } else {
        setError(
          "Sign-in finished, but no session was created. Please try again.",
        );
      }
    } catch (authError) {
      if (isGoogleSignInCancelled(authError)) return;

      const message = describeGoogleSignInError(authError);
      setError(message);
      Alert.alert("Google sign in failed", message);
    } finally {
      setGoogleSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#050A15", "#0B1628", "#0F1F33"]}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" style={styles.bgOrb1} />
      <View pointerEvents="none" style={styles.bgOrb2} />
      <View pointerEvents="none" style={styles.bgOrb3} />
      <View pointerEvents="none" style={styles.grid} />

      <View pointerEvents="none" style={styles.floatIconLeft}>
        <Ionicons
          name="leaf-outline"
          size={52}
          color="rgba(246, 196, 69, 0.12)"
        />
      </View>
      <View pointerEvents="none" style={styles.floatIconTopRight}>
        <Ionicons
          name="flash-outline"
          size={46}
          color="rgba(255,255,255,0.08)"
        />
      </View>
      <View pointerEvents="none" style={styles.floatIconBottomLeft}>
        <Ionicons
          name="leaf-outline"
          size={46}
          color="rgba(246, 196, 69, 0.12)"
        />
      </View>
      <View pointerEvents="none" style={styles.floatIconBottomRight}>
        <Ionicons
          name="flash-outline"
          size={52}
          color="rgba(255,255,255,0.08)"
        />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              step === "otp" && styles.otpScrollContent,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[styles.brandWrap, step === "otp" && styles.otpBrandWrap]}
            >
              <Image
                source={require("../../assets/images/LOGO3.png")}
                style={[styles.logo, step === "otp" && styles.otpLogo]}
                resizeMode="contain"
              />
              <Text
                style={[
                  styles.brandSubtitle,
                  step === "otp" && styles.otpBrandSubtitle,
                ]}
              >
                Piezo Technology - Kinetic Energy to Electricity
              </Text>
            </View>

            <View style={[styles.card, step === "otp" && styles.otpCard]}>
              <Text style={styles.title}>
                {step === "credentials" ? "Welcome back" : "Two-factor check"}
              </Text>
              <Text style={styles.subtitle}>
                {step === "credentials"
                  ? "Sign in to your BawatPieza account to continue."
                  : `Enter the 6-digit code we emailed to ${email.trim()}.`}
              </Text>

              {step === "otp" && (
                <>
                  <View style={styles.otpIconBadge}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={26}
                      color={BUTTER}
                    />
                  </View>

                  {info ? (
                    <View style={styles.otpInfoBox}>
                      <Ionicons
                        name="mail-open-outline"
                        size={14}
                        color={BUTTER}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.otpInfoText}>{info}</Text>
                    </View>
                  ) : null}

                  {otpError ? (
                    <View style={styles.otpErrorBox}>
                      <Ionicons
                        name={
                          netIssue
                            ? NETWORK_ISSUE_INFO[netIssue].icon
                            : "alert-circle-outline"
                        }
                        size={16}
                        color="#FCA5A5"
                        style={styles.errorIcon}
                      />
                      <Text style={styles.otpErrorText}>{otpError}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.label}>
                    6-digit code (expires in 5 minutes)
                  </Text>
                  <View style={styles.otpBoxes}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <TextInput
                        key={index}
                        ref={(input) => {
                          otpInputs.current[index] = input;
                        }}
                        style={[
                          styles.otpBox,
                          otp[index] && styles.otpBoxFilled,
                        ]}
                        value={otp[index] ?? ""}
                        onChangeText={(value) => {
                          const digits = value.replace(/[^0-9]/g, "");
                          if (!digits) {
                            setOtp((current) =>
                              index > 0
                                ? `${current.slice(0, index - 1)}${current.slice(index)}`
                                : current.slice(1),
                            );
                            return;
                          }
                          const next = otp.split("");
                          digits
                            .slice(0, 6 - index)
                            .split("")
                            .forEach((digit, offset) => {
                              next[index + offset] = digit;
                            });
                          const updated = next.join("").slice(0, 6);
                          setOtp(updated);
                          const nextIndex = Math.min(index + digits.length, 5);
                          otpInputs.current[nextIndex]?.focus();
                        }}
                        onKeyPress={({ nativeEvent }) => {
                          if (
                            nativeEvent.key === "Backspace" &&
                            !otp[index] &&
                            index > 0
                          ) {
                            otpInputs.current[index - 1]?.focus();
                          }
                        }}
                        keyboardType="number-pad"
                        textContentType={index === 0 ? "oneTimeCode" : "none"}
                        autoComplete={index === 0 ? "sms-otp" : "off"}
                        maxLength={6}
                        autoFocus={index === 0}
                        selectTextOnFocus
                        onSubmitEditing={
                          index === 5 ? handleVerifyOtp : undefined
                        }
                      />
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleVerifyOtp}
                    activeOpacity={0.9}
                    disabled={verifying}
                  >
                    <LinearGradient
                      colors={[PRUSSIAN, PRUSSIAN_SOFT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryButtonInner}
                    >
                      {verifying ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>
                            Verify and sign in
                          </Text>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={16}
                            color="#FFFFFF"
                            style={styles.primaryButtonIcon}
                          />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.otpActionsRow}>
                    <TouchableOpacity
                      onPress={handleResendOtp}
                      disabled={resendIn > 0 || resending}
                      hitSlop={8}
                    >
                      <Text
                        style={[
                          styles.linkText,
                          (resendIn > 0 || resending) &&
                            styles.linkTextDisabled,
                        ]}
                      >
                        {resending
                          ? "Sending..."
                          : resendIn > 0
                            ? `Resend code in ${resendIn}s`
                            : "Resend code"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={backToCredentials} hitSlop={8}>
                      <Text style={styles.linkText}>
                        Use a different account
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === "credentials" && (
                <>
                  <Text style={styles.label}>Email</Text>
                  <View style={styles.inputBox}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color="rgba(255,255,255,0.45)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>

                  <View style={styles.passwordHeader}>
                    <Text style={styles.label}>Password</Text>
                    <TouchableOpacity
                      onPress={() => router.push("/forgot-password")}
                    >
                      <Text style={styles.linkText}>Forgot password?</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputBox}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color="rgba(255,255,255,0.45)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showPassword ? "eye-outline" : "eye-off-outline"}
                        size={18}
                        color="rgba(255,255,255,0.45)"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.rememberRow}>
                    <TouchableOpacity
                      style={styles.checkboxWrap}
                      onPress={() => setRemember((value) => !value)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          remember && styles.checkboxChecked,
                        ]}
                      >
                        {remember ? (
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color="#FFFFFF"
                          />
                        ) : null}
                      </View>
                      <Text style={styles.rememberText}>Remember me</Text>
                    </TouchableOpacity>
                  </View>

                  {error ? (
                    <View style={styles.errorBox}>
                      <Ionicons
                        name={
                          netIssue
                            ? NETWORK_ISSUE_INFO[netIssue].icon
                            : "alert-circle-outline"
                        }
                        size={16}
                        color="#FCA5A5"
                        style={styles.errorIcon}
                      />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleLogin}
                    activeOpacity={0.9}
                    disabled={submitting}
                  >
                    <LinearGradient
                      colors={[PRUSSIAN, PRUSSIAN_SOFT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryButtonInner}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>Sign in</Text>
                          <Ionicons
                            name="arrow-forward"
                            size={16}
                            color="#FFFFFF"
                            style={styles.primaryButtonIcon}
                          />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.divider} />
                  </View>

                  <TouchableOpacity
                    style={styles.googleButton}
                    onPress={handleGoogleSignIn}
                    activeOpacity={0.9}
                    disabled={googleSigningIn}
                  >
                    {googleSigningIn ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <GmailMark />
                        <Text style={styles.googleButtonText}>
                          Continue with Google
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.footerRow}>
                    <Text style={styles.footerText}>
                      Don&apos;t have an account?
                    </Text>
                    <TouchableOpacity onPress={() => router.push("/signup")}>
                      <Text style={styles.footerLink}>Sign up</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Terms & Conditions gate for new Google SSO accounts */}
      <TermsModal
        visible={termsVisible}
        variant="dark"
        confirmLabel="I agree"
        busy={submitting}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />

      {/* Warm Welcome Modal */}
      <Modal visible={showWelcomeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <Ionicons name="sparkles" size={28} color={BUTTER} />
              </View>
              <Text style={styles.modalTitle}>Welcome, {welcomeName}!</Text>
            </View>
            <Text style={styles.modalMessage}>
              Your account is ready. Let's get your spaces set up.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { width: "100%", marginBottom: 0 }]}
              onPress={() => {
                setShowWelcomeModal(false);
                handleAuthSuccess();
              }}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[PRUSSIAN, PRUSSIAN_SOFT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonInner}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#FFFFFF"
                  style={styles.primaryButtonIcon}
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050A15",
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  otpScrollContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  bgOrb1: {
    position: "absolute",
    top: -140,
    left: -70,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(246, 196, 69, 0.18)",
  },
  bgOrb2: {
    position: "absolute",
    bottom: -120,
    right: -80,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: "rgba(246, 196, 69, 0.10)",
  },
  bgOrb3: {
    position: "absolute",
    left: "50%",
    top: "28%",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(168, 184, 255, 0.08)",
    transform: [{ translateX: -160 }],
  },
  grid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.08,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  floatIconLeft: {
    position: "absolute",
    left: "10%",
    top: "18%",
  },
  floatIconTopRight: {
    position: "absolute",
    right: "12%",
    top: "22%",
  },
  floatIconBottomLeft: {
    position: "absolute",
    left: "14%",
    bottom: "16%",
  },
  floatIconBottomRight: {
    position: "absolute",
    right: "10%",
    bottom: "24%",
  },
  brandWrap: {
    alignItems: "center",
    marginBottom: 14,
    zIndex: 1,
  },
  otpBrandWrap: {
    marginBottom: 6,
  },
  otpLogo: {
    width: 170,
    height: 76,
  },
  otpBrandSubtitle: {
    marginTop: 4,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  logo: { width: 220, height: 112, marginBottom: 0 },
  brandSubtitle: {
    marginTop: 10,
    color: MUTED,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontWeight: "700",
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    zIndex: 1,
  },
  otpCard: {
    paddingVertical: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    fontFamily: fonts.extrabold,
    color: "#FFFFFF",
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: MUTED,
    marginBottom: 16,
  },
  label: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: fonts.semibold,
    marginBottom: 8,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#FFFFFF",
    paddingVertical: 2,
  },
  passwordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  linkText: {
    color: BUTTER,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: fonts.bold,
  },
  rememberRow: {
    marginTop: 2,
    marginBottom: 18,
  },
  checkboxWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  rememberText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "500",
    fontFamily: fonts.medium,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorIcon: {
    marginTop: 1,
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: fonts.semibold,
    lineHeight: 17,
  },
  primaryButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  primaryButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    fontFamily: fonts.extrabold,
    marginRight: 8,
  },
  primaryButtonIcon: {
    marginLeft: 4,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  divider: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  dividerText: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    marginHorizontal: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
    fontFamily: fonts.bold,
  },
  otpIconBadge: {
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(246, 196, 69, 0.12)",
    marginBottom: 10,
  },
  otpInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(246, 196, 69, 0.10)",
    borderColor: "rgba(246, 196, 69, 0.35)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  otpInfoText: {
    flex: 1,
    color: BUTTER,
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
  otpErrorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239,68,68,0.35)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  otpErrorText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: fonts.semibold,
    lineHeight: 17,
  },
  otpBoxes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 14,
  },
  otpBox: {
    flex: 1,
    maxWidth: 46,
    minWidth: 34,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: INPUT_BG,
    color: "#FFFFFF",
    fontSize: 19,
    fontFamily: fonts.extrabold,
    textAlign: "center",
    paddingVertical: 0,
  },
  otpBoxFilled: {
    borderColor: "rgba(246, 196, 69, 0.7)",
    backgroundColor: "rgba(246, 196, 69, 0.08)",
  },
  otpActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  linkTextDisabled: {
    color: "rgba(255, 255, 255, 0.35)",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 12,
  },
  googleButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: fonts.bold,
    marginLeft: 10,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: { color: MUTED, fontSize: 13 },
  footerLink: {
    color: BUTTER,
    fontSize: 13,
    fontWeight: "800",
    fontFamily: fonts.extrabold,
    marginLeft: 4,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: SURFACE,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: LINE,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  modalIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "rgba(246, 196, 69, 0.15)",
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: fonts.extrabold,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
});
