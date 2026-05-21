import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import KrynoLogo from '../components/KrynoLogo';
import { COLORS, FONTS, GRADIENTS, RADIUS, SPACE } from '../lib/theme';
import { useKrynoBackend } from '../lib/krynoBackend';

type AuthMode = 'login' | 'signup' | 'verify' | 'reset';

export default function AuthScreen() {
  const {
    backendOrigin,
    error,
    loading,
    login,
    requestPasswordReset,
    resendVerification,
    resetPassword,
    setBackendOrigin,
    signup,
    verifyEmail
  } = useKrynoBackend();
  const [mode, setMode] = useState<AuthMode>('login');
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [serverInput, setServerInput] = useState(backendOrigin);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [signupForm, setSignupForm] = useState({ username: '', email: '', password: '' });
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetForm, setResetForm] = useState({ email: '', code: '', newPassword: '' });

  const feedback = localError || error;

  const clearFeedback = () => {
    setLocalError('');
    setNotice('');
  };

  const helperCopy = useMemo(() => {
    if (mode === 'signup') {
      return 'Create your secure Kryno identity.';
    }

    if (mode === 'verify') {
      return 'Enter the email code to unlock your account.';
    }

    if (mode === 'reset') {
      return 'Reset your password with a secure email code.';
    }

    return 'Securing your digital frontier';
  }, [mode]);

  const handleLogin = async () => {
    if (!loginForm.identifier.trim() || !loginForm.password.trim()) {
      setLocalError('Enter your username and password.');
      return;
    }

    clearFeedback();

    try {
      await login(loginForm.identifier, loginForm.password);
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to sign in.');
    }
  };

  const handleSignup = async () => {
    if (!signupForm.username.trim() || !signupForm.email.trim() || !signupForm.password.trim()) {
      setLocalError('Complete username, email, and password.');
      return;
    }

    clearFeedback();

    try {
      const result = await signup(signupForm);
      setVerificationEmail(result.email);
      setVerificationCode('');
      setLoginForm((current) => ({
        ...current,
        identifier: result.username
      }));
      setMode('verify');
      setNotice(
        result.verificationCodePreview
          ? `Account created. Development verification code: ${result.verificationCodePreview}`
          : 'Account created. Check your email for the verification code.'
      );
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to create account.');
    }
  };

  const handleVerify = async () => {
    if (!verificationEmail.trim() || verificationCode.trim().length !== 6) {
      setLocalError('Enter your email and the 6-digit verification code.');
      return;
    }

    clearFeedback();

    try {
      await verifyEmail(verificationEmail, verificationCode);
      setMode('login');
      setNotice('Email verified. You can log in now.');
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to verify code.');
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail.trim()) {
      setLocalError('Enter your verification email first.');
      return;
    }

    clearFeedback();

    try {
      const result = await resendVerification(verificationEmail);
      setNotice(
        result.verificationCodePreview
          ? `New code sent. Development preview: ${result.verificationCodePreview}`
          : 'A fresh verification code has been sent.'
      );
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to resend verification code.');
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!resetForm.email.trim()) {
      setLocalError('Enter your email first.');
      return;
    }

    clearFeedback();

    try {
      const result = await requestPasswordReset(resetForm.email);
      setNotice(
        result.resetCodePreview
          ? `Reset code sent. Development preview: ${result.resetCodePreview}`
          : 'Password reset code sent to your email.'
      );
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to send reset code.');
    }
  };

  const handleResetPassword = async () => {
    if (!resetForm.email.trim() || resetForm.code.trim().length !== 6 || !resetForm.newPassword.trim()) {
      setLocalError('Enter email, reset code, and your new password.');
      return;
    }

    clearFeedback();

    try {
      await resetPassword(resetForm.email, resetForm.code, resetForm.newPassword);
      setResetForm({ email: resetForm.email, code: '', newPassword: '' });
      setMode('login');
      setNotice('Password reset complete. You can sign in now.');
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to reset password.');
    }
  };

  const renderLogin = () => (
    <>
      <FieldLabel label="Username" />
      <InputRow
        icon="person-outline"
        placeholder="Username"
        value={loginForm.identifier}
        onChangeText={(value) => setLoginForm((current) => ({ ...current, identifier: value }))}
      />

      <View style={styles.fieldHeader}>
        <FieldLabel label="Password" />
        <Pressable onPress={() => {
          clearFeedback();
          setResetForm((current) => ({ ...current, email: loginForm.identifier.includes('@') ? loginForm.identifier : current.email }));
          setMode('reset');
        }}>
          <Text style={styles.linkButton}>Forgot password?</Text>
        </Pressable>
      </View>
      <InputRow
        icon="lock-closed-outline"
        placeholder="Password"
        secureTextEntry={!passwordVisible}
        value={loginForm.password}
        onChangeText={(value) => setLoginForm((current) => ({ ...current, password: value }))}
        trailingLabel={passwordVisible ? 'Hide' : 'Show'}
        onTrailingPress={() => setPasswordVisible((current) => !current)}
      />

      <PrimaryButton label={loading ? 'Signing in...' : 'Log In'} loading={loading} onPress={handleLogin} />
    </>
  );

  const renderSignup = () => (
    <>
      <FieldLabel label="Username" />
      <InputRow
        icon="person-outline"
        placeholder="Username"
        value={signupForm.username}
        onChangeText={(value) => setSignupForm((current) => ({ ...current, username: value }))}
      />

      <FieldLabel label="Email" />
      <InputRow
        icon="mail-outline"
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={signupForm.email}
        onChangeText={(value) => setSignupForm((current) => ({ ...current, email: value }))}
      />

      <View style={styles.fieldHeader}>
        <FieldLabel label="Password" />
        <Pressable onPress={() => setPasswordVisible((current) => !current)}>
          <Text style={styles.linkButton}>{passwordVisible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      <InputRow
        icon="lock-closed-outline"
        placeholder="Password"
        secureTextEntry={!passwordVisible}
        value={signupForm.password}
        onChangeText={(value) => setSignupForm((current) => ({ ...current, password: value }))}
      />

      <Text style={styles.deviceCopy}>Trusted device: Kryno Mobile</Text>
      <PrimaryButton label={loading ? 'Creating account...' : 'Create account'} loading={loading} onPress={handleSignup} />
    </>
  );

  const renderVerify = () => (
    <>
      <FieldLabel label="Verification email" />
      <InputRow
        icon="mail-outline"
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={verificationEmail}
        onChangeText={setVerificationEmail}
      />

      <View style={styles.fieldHeader}>
        <FieldLabel label="Verification code" />
        <Pressable onPress={handleResendVerification}>
          <Text style={styles.linkButton}>Resend code</Text>
        </Pressable>
      </View>
      <InputRow
        icon="key-outline"
        placeholder="Enter 6-digit code"
        keyboardType="number-pad"
        maxLength={6}
        value={verificationCode}
        onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))}
      />

      <PrimaryButton label={loading ? 'Verifying...' : 'Verify code'} loading={loading} onPress={handleVerify} />
    </>
  );

  const renderReset = () => (
    <>
      <View style={styles.fieldHeader}>
        <FieldLabel label="Email" />
        <Pressable onPress={handleRequestPasswordReset}>
          <Text style={styles.linkButton}>Send code</Text>
        </Pressable>
      </View>
      <InputRow
        icon="mail-outline"
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={resetForm.email}
        onChangeText={(value) => setResetForm((current) => ({ ...current, email: value }))}
      />

      <FieldLabel label="Reset code" />
      <InputRow
        icon="key-outline"
        placeholder="Enter 6-digit code"
        keyboardType="number-pad"
        maxLength={6}
        value={resetForm.code}
        onChangeText={(value) => setResetForm((current) => ({ ...current, code: value.replace(/\D/g, '').slice(0, 6) }))}
      />

      <View style={styles.fieldHeader}>
        <FieldLabel label="New password" />
        <Pressable onPress={() => setResetPasswordVisible((current) => !current)}>
          <Text style={styles.linkButton}>{resetPasswordVisible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      <InputRow
        icon="lock-closed-outline"
        placeholder="New password"
        secureTextEntry={!resetPasswordVisible}
        value={resetForm.newPassword}
        onChangeText={(value) => setResetForm((current) => ({ ...current, newPassword: value }))}
      />

      <PrimaryButton label={loading ? 'Resetting...' : 'Reset password'} loading={loading} onPress={handleResetPassword} />
    </>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.glowOrbTop} />
          <View style={styles.glowOrbBottom} />

          <Pressable
            onLongPress={() => {
              setServerInput(backendOrigin);
              setShowServerConfig((current) => !current);
            }}
            style={styles.hero}
          >
            <KrynoLogo />
            <Text style={styles.heroTitle}>Kryno</Text>
            <Text style={styles.heroSubtitle}>{helperCopy}</Text>
          </Pressable>

          <View style={styles.card}>
            {showServerConfig ? (
              <View style={styles.serverPanel}>
                <Text style={styles.serverPanelTitle}>Server override</Text>
                <Text style={styles.serverPanelCopy}>Only use this if your Cloudflare backend link changed.</Text>
                <InputRow
                  icon="cloud-outline"
                  placeholder="https://your-cloudflare-url.trycloudflare.com"
                  value={serverInput}
                  onChangeText={setServerInput}
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={async () => {
                    try {
                      clearFeedback();
                      await setBackendOrigin(serverInput);
                      setNotice('Backend server updated for this device.');
                      setShowServerConfig(false);
                    } catch (serverError) {
                      setLocalError(serverError instanceof Error ? serverError.message : 'Unable to save backend server.');
                    }
                  }}
                  style={styles.serverSaveButton}
                >
                  <Text style={styles.serverSaveButtonText}>Save server</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {mode === 'login' && renderLogin()}
            {mode === 'signup' && renderSignup()}
            {mode === 'verify' && renderVerify()}
            {mode === 'reset' && renderReset()}

            {feedback ? <Text style={styles.errorText}>{feedback}</Text> : null}
            {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

            <View style={styles.footerCta}>
              {mode === 'login' ? (
                <>
                  <Text style={styles.switchCopy}>Don&apos;t have an account?</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      clearFeedback();
                      setMode('signup');
                    }}
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineButtonText}>Create account</Text>
                  </TouchableOpacity>
                </>
              ) : mode === 'signup' ? (
                <>
                  <Text style={styles.switchCopy}>Already have an account?</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      clearFeedback();
                      setMode('login');
                    }}
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineButtonText}>Log in</Text>
                  </TouchableOpacity>
                </>
              ) : mode === 'reset' ? (
                <>
                  <Text style={styles.switchCopy}>Remembered your password?</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      clearFeedback();
                      setMode('login');
                    }}
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineButtonText}>Back to login</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.switchCopy}>Back to your secure sign-in</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      clearFeedback();
                      setMode('login');
                    }}
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineButtonText}>Log in</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>;
}

function InputRow({
  autoCapitalize = 'none',
  icon,
  keyboardType,
  maxLength,
  onChangeText,
  onTrailingPress,
  placeholder,
  secureTextEntry,
  trailingLabel,
  value
}: {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  maxLength?: number;
  onChangeText: (value: string) => void;
  onTrailingPress?: () => void;
  placeholder: string;
  secureTextEntry?: boolean;
  trailingLabel?: string;
  value: string;
}) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name={icon} size={18} color={COLORS.textMuted} />
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
      {trailingLabel && onTrailingPress ? (
        <Pressable onPress={onTrailingPress}>
          <Text style={styles.linkButton}>{trailingLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PrimaryButton({
  label,
  loading,
  onPress
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} disabled={loading} onPress={onPress}>
      <LinearGradient colors={[COLORS.primary, COLORS.accent]} style={styles.primaryButton}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  flex: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xl
  },
  glowOrbTop: {
    position: 'absolute',
    top: 24,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.primarySoft
  },
  glowOrbBottom: {
    position: 'absolute',
    right: -90,
    bottom: 48,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: COLORS.accentGlow
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACE.xl
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: FONTS.xxl,
    fontWeight: FONTS.black
  },
  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: FONTS.base,
    textAlign: 'center'
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.lg,
    gap: 12,
    overflow: 'hidden'
  },
  serverPanel: {
    backgroundColor: COLORS.bgGlass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.md,
    gap: 10
  },
  serverPanelTitle: {
    color: COLORS.text,
    fontSize: FONTS.base,
    fontWeight: FONTS.bold
  },
  serverPanelCopy: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm,
    lineHeight: 18
  },
  serverSaveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    backgroundColor: COLORS.bgSurface,
    paddingVertical: 12
  },
  serverSaveButtonText: {
    color: COLORS.text,
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  label: {
    color: COLORS.textSub,
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bgGlass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONTS.base
  },
  linkButton: {
    color: COLORS.primaryLight,
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold
  },
  deviceCopy: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONTS.sm,
    lineHeight: 20
  },
  noticeText: {
    color: COLORS.primaryLight,
    fontSize: FONTS.sm,
    lineHeight: 20
  },
  primaryButton: {
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FONTS.base,
    fontWeight: FONTS.bold
  },
  footerCta: {
    marginTop: 10,
    alignItems: 'center',
    gap: 10
  },
  switchCopy: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm
  },
  outlineButton: {
    minWidth: 170,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    backgroundColor: COLORS.bgGlass,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  outlineButtonText: {
    color: COLORS.text,
    fontSize: FONTS.base,
    fontWeight: FONTS.semibold
  }
});
