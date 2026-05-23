import { useState, useRef } from 'react';
import { View, Text, Pressable, SafeAreaView, Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0, 80)}`);
  }
}

export default function JoinChorSipahiScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { token } = useAuthStore();

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { Alert.alert('Invalid code', 'Enter a 6-digit room code'); return; }
    if (loading) return;
    if (!token) {
      Alert.alert('Login required', 'Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/cs/rooms/${trimmed}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readJson(res) as { detail?: string };
      if (!res.ok) throw new Error(data.detail ?? `Join failed (${res.status})`);
      router.replace(`/chor-sipahi/${trimmed}`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <View style={{ flex: 1, padding: 24, gap: 24 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Colors.bg.card }}>
            <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
          </Pressable>
          <View>
            <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Join Room</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>Harami vs Shurta 👑 🧾 👮 🕵️</Text>
          </View>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <Text style={{ fontSize: 64 }}>🕵️</Text>

          <View style={{ width: '100%', gap: 12 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 }}>
              Enter Room Code
            </Text>
            <Pressable onPress={() => inputRef.current?.focus()}>
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={Colors.text.muted}
                keyboardType="number-pad"
                maxLength={6}
                onSubmitEditing={handleJoin}
                style={{
                  backgroundColor: Colors.bg.card,
                  borderRadius: 16, borderWidth: 1.5,
                  borderColor: code.length === 6 ? Colors.purple : Colors.border,
                  color: Colors.text.primary,
                  fontSize: 36, fontFamily: 'Poppins_700Bold',
                  textAlign: 'center', paddingVertical: 20,
                  letterSpacing: 10,
                }}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={handleJoin}
            disabled={loading || code.length !== 6}
            style={{
              width: '100%', backgroundColor: Colors.purple, borderRadius: 16,
              paddingVertical: 16, alignItems: 'center',
              opacity: (loading || code.length !== 6) ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#fff' }}>
              {loading ? 'Joining...' : 'Join Game'}
            </Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}
