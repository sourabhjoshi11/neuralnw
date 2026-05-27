import { useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { analytics } from '@/utils/analytics';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

const CATEGORIES = [
  { key: 'mixed', label: 'Mixed 🎲', desc: 'All categories' },
  { key: 'college', label: 'College Life 📚', desc: 'Proxy, bunk, CGPA...' },
  { key: 'hostel', label: 'Hostel 🏠', desc: 'Maggi, roommate, curfew...' },
  { key: 'desi', label: 'Desi Things 🇮🇳', desc: 'Auto, chai, jugaad...' },
  { key: 'bollywood', label: 'Bollywood 🎬', desc: 'SRK, item song, interval...' },
  { key: 'memes', label: 'Memes 😂', desc: 'Monday morning, deadline...' },
];

export default function CreateScribbleScreen() {
  const [category, setCategory] = useState('mixed');
  const [sabotage, setSabotage] = useState(true);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/scribble/rooms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, sabotage_mode: sabotage, total_rounds: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Failed');
      analytics.track('scribble_created', { category, sabotage });
      router.replace(`/scribble/${data.code}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Colors.bg.card }}>
            <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>🎨 Doodle Chaos</Text>
        </View>

        {/* Category */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1 }}>Word Category</Text>
          {CATEGORIES.map(c => (
            <Pressable key={c.key} onPress={() => setCategory(c.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: category === c.key ? 'rgba(6,182,212,0.12)' : Colors.bg.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: category === c.key ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{c.label}</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>{c.desc}</Text>
              </View>
              {category === c.key && <Ionicons name="checkmark-circle" size={20} color={Colors.cyan} />}
            </Pressable>
          ))}
        </View>

        {/* Sabotage toggle */}
        <Pressable onPress={() => setSabotage(!sabotage)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: sabotage ? 'rgba(239,68,68,0.1)' : Colors.bg.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: sabotage ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)' }}>
          <Text style={{ fontSize: 28 }}>🕵️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>Sabotage Mode</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>One player secretly misleads others</Text>
          </View>
          <Ionicons name={sabotage ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={sabotage ? '#ef4444' : Colors.text.muted} />
        </Pressable>

        {/* Create */}
        <Pressable onPress={handleCreate} disabled={loading}
          style={{ backgroundColor: Colors.cyan, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#000' }}>{loading ? 'Creating...' : 'Create Room 🎨'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
