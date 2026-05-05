import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';
const OTP_LENGTH = 6;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  const scale = useSharedValue(1);
  const shakeX = useSharedValue(0);
  const { setUser, setLoading: setAuthLoading } = useAuthStore();

  useEffect(() => {
    const id = setInterval(() => {
      setResendTimer((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 60 })
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleChange = (val: string, index: number) => {
    const digits = val.replace(/\D/g, '');
    if (!digits) {
      const next = [...otp];
      next[index] = '';
      setOtp(next);
      if (index > 0) inputRefs.current[index - 1]?.focus();
      return;
    }
    const next = [...otp];
    next[index] = digits[digits.length - 1];
    setOtp(next);
    if (index < OTP_LENGTH - 1 && digits) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== OTP_LENGTH || loading) return;
    setLoading(true);
    setAuthLoading(true);
    try {
      const resp = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: code }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        shake();
        Alert.alert('Invalid OTP', data.detail ?? 'Please try again');
        return;
      }
      if (data.is_new_user) {
        router.push({ pathname: '/(auth)/name', params: { phone, token: data.token } });
      } else {
        setUser(data.user, data.token);
        router.replace('/(tabs)/home');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      await fetch(`${API_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      setResendTimer(30);
    } catch {
      Alert.alert('Error', 'Failed to resend OTP');
    }
  };

  const isComplete = otp.every((d) => d !== '');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 32 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: Colors.text.primary, fontSize: 32, fontFamily: 'Syne_800ExtraBold' }}>
            Verify OTP
          </Text>
          <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
            Enter the 6-digit code sent to {phone}
          </Text>
        </View>

        <Animated.View style={[{ flexDirection: 'row', gap: 10, justifyContent: 'center' }, shakeStyle]}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              style={{
                width: 48,
                height: 56,
                borderRadius: 12,
                backgroundColor: Colors.bg.card,
                borderWidth: 1,
                borderColor: digit ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.07)',
                color: Colors.text.primary,
                fontSize: 22,
                fontFamily: 'Inter_700Bold',
                textAlign: 'center',
              }}
              maxLength={1}
              keyboardType="number-pad"
              value={digit}
              onChangeText={(v) => handleChange(v, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              autoFocus={i === 0}
              selectTextOnFocus
            />
          ))}
        </Animated.View>

        <Pressable
          onPress={handleVerify}
          onPressIn={() => { scale.value = withSpring(0.95, SpringConfig.snappy); }}
          onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
          disabled={!isComplete || loading}
        >
          <Animated.View style={btnStyle}>
            <LinearGradient
              colors={isComplete ? ['#3b82f6', '#06b6d4'] : ['#1a2235', '#1a2235']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 16,
                borderRadius: BorderRadius.btn,
                alignItems: 'center',
                shadowColor: '#3b82f6',
                shadowOpacity: isComplete ? 0.4 : 0,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: isComplete ? 8 : 0,
              }}
            >
              <Text style={{ color: isComplete ? '#fff' : Colors.text.muted, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
                {loading ? 'Verifying...' : 'Verify →'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <Pressable onPress={handleResend} disabled={resendTimer > 0}>
          <Text style={{ textAlign: 'center', color: resendTimer > 0 ? Colors.text.muted : Colors.blue, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
