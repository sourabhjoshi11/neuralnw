import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const scale = useSharedValue(1);

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const isValid = /^\d{10}$/.test(phone.replace(/\s/g, ''));

  const handleSendOtp = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${phone.replace(/\s/g, '')}` }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert('Error', data.detail ?? 'Failed to send OTP');
        return;
      }
      router.push({ pathname: '/(auth)/otp', params: { phone: `+91${phone.replace(/\s/g, '')}` } });
    } catch {
      Alert.alert('Error', 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 32 }}>
          <View style={{ gap: 8 }}>
            <Text style={{ color: Colors.text.primary, fontSize: 32, fontFamily: 'Poppins_700Bold' }}>
              Enter your number
            </Text>
            <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
              We'll send a verification code via SMS
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.input,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRightWidth: 1,
                borderColor: 'rgba(255,255,255,0.07)',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: Colors.text.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>
                🇮🇳 +91
              </Text>
            </View>
            <TextInput
              style={{
                flex: 1,
                color: Colors.text.primary,
                fontSize: 18,
                fontFamily: 'Poppins_500Medium',
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
              placeholder="98765 43210"
              placeholderTextColor={Colors.text.muted}
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
              autoFocus
            />
          </View>

          <Pressable
            onPress={handleSendOtp}
            onPressIn={() => { scale.value = withSpring(0.95, SpringConfig.snappy); }}
            onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
            disabled={!isValid || loading}
          >
            <Animated.View style={btnStyle}>
              <LinearGradient
                colors={isValid ? ['#3b82f6', '#06b6d4'] : ['#1a2235', '#1a2235']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingVertical: 16,
                  borderRadius: BorderRadius.btn,
                  alignItems: 'center',
                  shadowColor: '#3b82f6',
                  shadowOpacity: isValid ? 0.4 : 0,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: isValid ? 8 : 0,
                }}
              >
                <Text
                  style={{
                    color: isValid ? '#fff' : Colors.text.muted,
                    fontSize: 16,
                    fontFamily: 'Poppins_700Bold',
                  }}
                >
                  {loading ? 'Sending...' : 'Send OTP →'}
                </Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>

          <Text
            style={{
              color: Colors.text.muted,
              fontSize: 12,
              fontFamily: 'Poppins_400Regular',
              textAlign: 'center',
              lineHeight: 18,
            }}
          >
            By continuing, you agree to our Terms of Service.{'\n'}
            One account per phone number.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
