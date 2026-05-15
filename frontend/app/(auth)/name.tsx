import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

export default function NameScreen() {
  const { phone, token } = useLocalSearchParams<{ phone: string; token: string }>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const scale = useSharedValue(1);
  const { setUser, setLoading: setAuthLoading } = useAuthStore();

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isValid = name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setAuthLoading(true);
    try {
      const resp = await fetch(`${API_URL}/auth/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert('Error', data.detail ?? 'Failed to save name');
        return;
      }
      setUser(data.user, data.token);
      router.replace('/(tabs)/home');
    } catch {
      Alert.alert('Error', 'Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 32 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: Colors.text.primary, fontSize: 32, fontFamily: 'Poppins_700Bold' }}>
            What's your name?
          </Text>
          <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
            Your real name is kept private. Only shown if identity is revealed.
          </Text>
        </View>

        <TextInput
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.input,
            borderWidth: 1,
            borderColor: name ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)',
            color: Colors.text.primary,
            fontSize: 18,
            fontFamily: 'Poppins_500Medium',
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
          placeholder="e.g. Rahul Sharma"
          placeholderTextColor={Colors.text.muted}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <Pressable
          onPress={handleSubmit}
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
              <Text style={{ color: isValid ? '#fff' : Colors.text.muted, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
                {loading ? 'Saving...' : "Let's Go! 🎲"}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            padding: 16,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular', lineHeight: 18 }}>
            🔒 Your real name is encrypted and only revealed in extreme circumstances (3-strike rule). In all games you'll be anonymous.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
