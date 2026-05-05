import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

export default function JoinGameScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();
  const { setRoom, setMyPlayer } = useGameStore();
  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const isValid = /^\d{6}$/.test(code.trim());

  const handleJoin = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/game/rooms/${code.trim()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert('Error', data.detail ?? 'Room not found');
        return;
      }
      setRoom(data.room);
      setMyPlayer(data.player);
      router.push(`/game/${data.room.code}`);
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <View style={{ flex: 1, padding: 20, gap: 28, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
          </Pressable>
          <Text style={{ color: Colors.text.primary, fontSize: 24, fontFamily: 'Syne_800ExtraBold' }}>
            Join Room
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            Enter the 6-digit room code
          </Text>
          <TextInput
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.input,
              borderWidth: 1,
              borderColor: code ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)',
              color: Colors.text.primary,
              fontSize: 32,
              fontFamily: 'Inter_700Bold',
              paddingHorizontal: 20,
              paddingVertical: 16,
              textAlign: 'center',
              letterSpacing: 8,
            }}
            placeholder="123456"
            placeholderTextColor={Colors.text.muted}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            autoFocus
          />
        </View>

        <Pressable
          onPress={handleJoin}
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
              <Text style={{ color: isValid ? '#fff' : Colors.text.muted, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
                {loading ? 'Joining...' : 'Join Room →'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
