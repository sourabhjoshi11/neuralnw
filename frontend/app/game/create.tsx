import { useState } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';
const DURATIONS = [15, 30, 45, 60];

export default function CreateGameScreen() {
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();
  const { setRoom, setMyPlayer } = useGameStore();
  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/game/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ duration_minutes: duration }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert('Error', data.detail ?? 'Failed to create room');
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
      <ScrollView contentContainerStyle={{ padding: 20, gap: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
          </Pressable>
          <Text style={{ color: Colors.text.primary, fontSize: 24, fontFamily: 'Syne_900Black' }}>
            Create Room
          </Text>
        </View>

        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            padding: 20,
            gap: 16,
          }}
        >
          <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
            Game Duration
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                style={{ flex: 1 }}
                onPress={() => setDuration(d)}
              >
                <View
                  style={{
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: duration === d ? Colors.blue : Colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: duration === d ? Colors.blue : 'rgba(255,255,255,0.07)',
                  }}
                >
                  <Text
                    style={{
                      color: duration === d ? '#fff' : Colors.text.secondary,
                      fontSize: 14,
                      fontFamily: 'Inter_700Bold',
                    }}
                  >
                    {d}m
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            padding: 20,
            gap: 12,
          }}
        >
          <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
            How it works
          </Text>
          {[
            ['🍾', 'Spin selects a random player'],
            ['🎯', 'Truth (+10pts) or Dare (+20pts)'],
            ['😂', '1 min reaction time for everyone'],
            ['🏆', 'Last place gets revealed!'],
          ].map(([emoji, text]) => (
            <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
              <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 }}>
                {text}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleCreate}
          onPressIn={() => { scale.value = withSpring(0.95, SpringConfig.snappy); }}
          onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
          disabled={loading}
        >
          <Animated.View style={btnStyle}>
            <LinearGradient
              colors={['#3b82f6', '#06b6d4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 16,
                borderRadius: BorderRadius.btn,
                alignItems: 'center',
                shadowColor: '#3b82f6',
                shadowOpacity: 0.4,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
                {loading ? 'Creating...' : `Create ${duration}min Room 🎲`}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
