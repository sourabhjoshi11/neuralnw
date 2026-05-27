import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { Haptics } from '@/utils/compat';
import { analytics } from '@/utils/analytics';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';
const REACT_EMOJIS = ['🔥', '💀', '😂', '❤️', '😱', '🤡'];

type Confession = { id: string; content: string; reactions: Record<string, number>; created_at: string };

export default function ConfessionsScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token } = useAuthStore();
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const fetchConfessions = useCallback(async () => {
    if (!token || !code) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/social/feeds/${code}/confessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConfessions(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, code]);

  useEffect(() => { fetchConfessions(); }, [fetchConfessions]);

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_URL}/social/feeds/${code}/confessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfessions(prev => [data, ...prev]);
        setText('');
        Haptics.messageSent();
        analytics.track('confession_posted', { feed_code: code });
      } else {
        const err = await res.json();
        Alert.alert('Error', err.detail ?? 'Could not post');
      }
    } catch { Alert.alert('Error', 'Network error'); }
    finally { setPosting(false); }
  };

  const handleReact = async (confessionId: string, emoji: string) => {
    Haptics.selection();
    try {
      const res = await fetch(`${API_URL}/social/confessions/${confessionId}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const { reactions } = await res.json();
        setConfessions(prev => prev.map(c => c.id === confessionId ? { ...c, reactions } : c));
      }
    } catch { /* silent */ }
  };

  const handleReport = (confessionId: string) => {
    Alert.alert('Report', 'Report this confession as inappropriate?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report', style: 'destructive', onPress: async () => {
          await fetch(`${API_URL}/social/confessions/${confessionId}/report`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` },
          });
          setConfessions(prev => prev.filter(c => c.id !== confessionId));
        }
      },
    ]);
  };

  const timeAgo = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
        </Pressable>
        <View>
          <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>🤫 Confessions</Text>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>100% Anonymous · No one knows who posted</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={confessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            <View style={{ backgroundColor: Colors.bg.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>🕵️ Anonymous · {timeAgo(item.created_at)}</Text>
                <Pressable onPress={() => handleReport(item.id)} hitSlop={8}>
                  <Ionicons name="flag-outline" size={14} color={Colors.text.muted} />
                </Pressable>
              </View>
              <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_400Regular', lineHeight: 22 }}>{item.content}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {REACT_EMOJIS.map(emoji => {
                  const count = item.reactions[emoji] || 0;
                  return (
                    <Pressable key={emoji} onPress={() => handleReact(item.id, emoji)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: count > 0 ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: count > 0 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)' }}>
                      <Text style={{ fontSize: 14 }}>{emoji}</Text>
                      {count > 0 && <Text style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>{count}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Text style={{ fontSize: 48 }}>🤐</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>No confessions yet. Be the first!</Text>
          </View>
        }
      />

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          <TextInput
            style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular', maxHeight: 100 }}
            placeholder="Confess anonymously..."
            placeholderTextColor={Colors.text.muted}
            value={text}
            onChangeText={(v) => setText(v.slice(0, 500))}
            multiline
            maxLength={500}
          />
          <Pressable
            onPress={handlePost}
            disabled={!text.trim() || posting}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? Colors.purple : 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', opacity: posting ? 0.5 : 1 }}>
            <Ionicons name="send" size={18} color={text.trim() ? '#fff' : Colors.text.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
