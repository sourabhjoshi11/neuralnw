import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

export default function JoinScribbleScreen() {
  const { code: prefill } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(prefill ?? '');
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) { Alert.alert('Invalid', 'Enter a 6-digit room code'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/scribble/rooms/${trimmed}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Failed to join');
      router.replace(`/scribble/${trimmed}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <View style={{ flex: 1, padding: 20, paddingTop: 38, gap: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
          </Pressable>
          <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>Join Doodle Chaos 🎨</Text>
        </View>

        <View style={{ alignItems: 'center', gap: 16 }}>
          <Text style={{ fontSize: 48 }}>🎨</Text>
          <TextInput
            style={{ width: '100%', backgroundColor: Colors.bg.card, borderRadius: BorderRadius.input, color: Colors.text.primary, fontSize: 24, fontFamily: 'Poppins_700Bold', paddingVertical: 16, textAlign: 'center', letterSpacing: 8, borderWidth: 1, borderColor: code.length === 6 ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.07)' }}
            placeholder="000000"
            placeholderTextColor={Colors.text.muted}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>

        <Pressable onPress={handleJoin} disabled={code.length !== 6 || loading}
          style={{ backgroundColor: code.length === 6 ? Colors.cyan : Colors.bg.card, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: code.length === 6 ? '#000' : Colors.text.muted }}>{loading ? 'Joining...' : 'Join Room'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
