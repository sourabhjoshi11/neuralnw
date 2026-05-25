import { useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const MODES = [
  { key: 'quick',   label: 'Quick',   emoji: '⚡', desc: '~90 sec · Fast & fun',        discussion: 30, guessing: 15 },
  { key: 'classic', label: 'Classic', emoji: '🎯', desc: '~3 min · Balanced gameplay',   discussion: 60, guessing: 20 },
  { key: 'party',   label: 'Party',   emoji: '🎉', desc: '~5 min · Full chaos mode',     discussion: 90, guessing: 25 },
] as const;

export default function CreateChorSipahiScreen() {
  const [mode, setMode] = useState<'quick' | 'classic' | 'party'>('quick');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();

  const handleCreate = async () => {
    if (loading) return;
    if (!token) {
      Alert.alert('Login required', 'Please log in again.');
      return;
    }
    console.log('[CS create] start', { api: API_URL, mode, maxPlayers, hasToken: !!token });
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/cs/rooms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, max_players: maxPlayers }),
      });
      const data = await readJson(res) as { code?: string; detail?: string };
      console.log('[CS create] response', { status: res.status, ok: res.ok, data });
      if (!res.ok) throw new Error(data.detail ?? `Create failed (${res.status})`);
      if (!data.code) throw new Error('Server did not return a room code');
      router.replace(`/chor-sipahi/${data.code}`);
    } catch (e: any) {
      console.log('[CS create] error', e?.message ?? e);
      Alert.alert('Error', e.message ?? 'Could not create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Colors.bg.card }}>
            <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
          </Pressable>
          <View>
            <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Harami vs Shurta</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>👑 🧾 👮 🕵️ Social deduction</Text>
          </View>
        </View>

        {/* Mode selector */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1 }}>Game Mode</Text>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: mode === m.key ? 'rgba(139,92,246,0.15)' : Colors.bg.card,
                borderRadius: 14, padding: 16,
                borderWidth: mode === m.key ? 1.5 : 1,
                borderColor: mode === m.key ? Colors.purple : Colors.border,
              }}
            >
              <Text style={{ fontSize: 28 }}>{m.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{m.label}</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>{m.desc}</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.text.muted, marginTop: 2 }}>
                  Discussion {m.discussion}s · Guess {m.guessing}s
                </Text>
              </View>
              {mode === m.key && <Ionicons name="checkmark-circle" size={22} color={Colors.purple} />}
            </Pressable>
          ))}
        </View>

        {/* Max players */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1 }}>Max Players</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[4, 5, 6, 8, 10].map((n) => (
              <Pressable
                key={n}
                onPress={() => setMaxPlayers(n)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                  backgroundColor: maxPlayers === n ? Colors.purple : Colors.bg.card,
                  borderWidth: 1, borderColor: maxPlayers === n ? Colors.purple : Colors.border,
                }}
              >
                <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: maxPlayers === n ? '#fff' : Colors.text.primary }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* How to play */}
        <View style={{ backgroundColor: Colors.bg.card, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>How to play</Text>
          {[
            { role: '👑 Malik',   desc: 'Revealed to all. Always gets 1000 pts.' },
            { role: '🧾 Wazir', desc: 'Must identify Harami & Shurta. Gets 500 if correct, 0 if wrong.' },
            { role: '👮 Shurta', desc: 'Hidden. Gets 300 pts if Harami caught, 300 if not.' },
            { role: '🕵️ Harami',  desc: 'Hidden. Gets 500 pts if NOT caught, 0 if caught!' },
          ].map((r) => (
            <View key={r.role} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary, width: 90 }}>{r.role}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>{r.desc}</Text>
            </View>
          ))}
        </View>

        {/* Create button */}
        <Pressable
          onPress={handleCreate}
          disabled={loading}
          style={{
            backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16,
            alignItems: 'center', opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#fff' }}>
            {loading ? 'Creating...' : 'Create Room'}
          </Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}
