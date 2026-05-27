import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { Haptics } from '@/utils/compat';
import { analytics } from '@/utils/analytics';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

type CrushStatus = { has_crush: boolean; crush_member_id: string | null; is_matched: boolean; match_username: string | null };
type Member = { id: string; username: string };

export default function SecretCrushScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token } = useAuthStore();
  const { members, myMemberId } = useFeedStore();
  const [status, setStatus] = useState<CrushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState(false);

  const otherMembers = (members as Member[]).filter(m => m.id !== myMemberId);

  const fetchStatus = useCallback(async () => {
    if (!token || !code) return;
    try {
      const res = await fetch(`${API_URL}/social/feeds/${code}/crush`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, code]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSetCrush = async (memberId: string) => {
    Alert.alert('Set Crush?', 'If they pick you too, both of you will be revealed! 💘', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Set Crush', onPress: async () => {
          setSetting(true);
          try {
            const res = await fetch(`${API_URL}/social/feeds/${code}/crush`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ to_member_id: memberId }),
            });
            if (res.ok) {
              const data = await res.json();
              Haptics.medium();
              analytics.track('crush_set', { feed_code: code, matched: data.is_matched });
              if (data.is_matched) {
                Alert.alert('💘 IT\'S A MATCH!', 'They picked you too! Go say hi 😏');
              }
              fetchStatus();
            } else {
              const err = await res.json();
              Alert.alert('Error', err.detail ?? 'Could not set crush');
            }
          } catch { Alert.alert('Error', 'Network error'); }
          finally { setSetting(false); }
        }
      },
    ]);
  };

  const handleRemove = () => {
    Alert.alert('Remove Crush?', 'Your selection will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await fetch(`${API_URL}/social/feeds/${code}/crush`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          });
          setStatus({ has_crush: false, crush_member_id: null, is_matched: false, match_username: null });
        }
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text.muted, fontSize: 14 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  // Match reveal screen
  if (status?.is_matched) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
          </Pressable>
          <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>💘 Secret Crush</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
          <Animated.View entering={ZoomIn.springify()}>
            <Text style={{ fontSize: 80 }}>💘</Text>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(300)} style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ color: Colors.text.primary, fontSize: 24, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>It's a Match!</Text>
            <Text style={{ color: Colors.pink, fontSize: 18, fontFamily: 'Poppins_600SemiBold' }}>{status.match_username}</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 8 }}>You both picked each other! 🎉{'\n'}Go say something in the feed 😏</Text>
          </Animated.View>
          <Pressable onPress={handleRemove} style={{ marginTop: 20 }}>
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>Reset crush</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
        </Pressable>
        <View>
          <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>💘 Secret Crush</Text>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>Pick someone · If mutual → revealed!</Text>
        </View>
      </View>

      {/* Current status */}
      {status?.has_crush && (
        <Animated.View entering={FadeIn} style={{ margin: 16, backgroundColor: 'rgba(236,72,153,0.1)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(236,72,153,0.2)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: Colors.pink, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>Your crush is set 💕</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>Waiting for them to pick you back...</Text>
          </View>
          <Pressable onPress={handleRemove}>
            <Ionicons name="close-circle" size={22} color={Colors.text.muted} />
          </Pressable>
        </Animated.View>
      )}

      {/* Info */}
      {!status?.has_crush && (
        <View style={{ padding: 16, gap: 8 }}>
          <View style={{ backgroundColor: Colors.bg.card, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_600SemiBold' }}>How it works</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 20 }}>
              {'1. Pick your crush from the list below\n2. If they pick you too → MATCH REVEALED 💘\n3. If not → stays secret forever 🤫\n\nNo one will ever know unless it\'s mutual!'}
            </Text>
          </View>
        </View>
      )}

      {/* Member list */}
      <FlatList
        data={otherMembers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 20 }}
        ListHeaderComponent={
          <Text style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Feed Members
          </Text>
        }
        renderItem={({ item }) => {
          const isSelected = status?.crush_member_id === item.id;
          return (
            <Pressable
              onPress={() => !isSelected && handleSetCrush(item.id)}
              disabled={setting}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: isSelected ? 'rgba(236,72,153,0.1)' : Colors.bg.card,
                borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: isSelected ? 'rgba(236,72,153,0.3)' : 'rgba(255,255,255,0.06)',
              }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: isSelected ? 'rgba(236,72,153,0.2)' : 'rgba(59,130,246,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{isSelected ? '💘' : '👤'}</Text>
              </View>
              <Text style={{ flex: 1, color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_500Medium' }}>{item.username}</Text>
              {isSelected && <Ionicons name="heart" size={20} color={Colors.pink} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>👀</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>No other members in this feed yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
