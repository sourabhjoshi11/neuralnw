import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, SafeAreaView, FlatList, ActivityIndicator, Alert, Modal, Image, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Haptics, shareText, copyToClipboard } from '@/utils/compat';
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

const COLORS = ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#a78bfa'];
function memberColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

type Member = {
  id: string;
  username: string;
  is_admin: boolean;
  weekly_message_count: number;
  joined_at: string;
};

function QRModal({ code, visible, onClose }: { code: string; visible: boolean; onClose: () => void }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(`classchaos://feed/join?code=${code}`)}`;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{
            backgroundColor: Colors.bg.card,
            borderRadius: 24, padding: 28, alignItems: 'center', gap: 18,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
            width: 300,
          }}>
            <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>Scan to Join</Text>

            {/* QR Code */}
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 8 }}>
              <Image
                source={{ uri: qrUrl }}
                style={{ width: 220, height: 220 }}
                resizeMode="contain"
              />
            </View>

            {/* Feed code */}
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>Feed code</Text>
              <Text style={{ color: Colors.cyan, fontSize: 28, fontFamily: 'Poppins_700Bold', letterSpacing: 5 }}>{code}</Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Pressable
                onPress={() => { copyToClipboard(code); Haptics.success(); }}
                style={{ flex: 1, backgroundColor: 'rgba(6,182,212,0.12)', borderRadius: 12, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(6,182,212,0.25)' }}
              >
                <Ionicons name="copy-outline" size={16} color={Colors.cyan} />
                <Text style={{ color: Colors.cyan, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={() => shareText(`Join my ClassChaos feed!\n\nCode: ${code}\n\nDownload ClassChaos and enter this code to join.`)}
                style={{ flex: 1, backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              >
                <Ionicons name="share-social-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>Share</Text>
              </Pressable>
            </View>

            <Pressable onPress={onClose}>
              <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function FeedInfoScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token } = useAuthStore();
  const store = useFeedStore();
  const feed = store.feed as any;
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean>(feed?.is_public ?? false);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!token || !code) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMembers(await res.json());
    } catch {
      Alert.alert('Error', 'Could not load members.');
    } finally {
      setLoading(false);
    }
  }, [token, code]);

  useEffect(() => {
    fetchMembers().then(() => {
      const me = members.find((m) => m.id === store.myMemberId);
      if (me?.is_admin) setIsAdmin(true);
    });
    setIsPublic(feed?.is_public ?? false);
  }, []);

  const togglePublic = async (val: boolean) => {
    if (!token || !code) return;
    setIsPublic(val);
    try {
      await fetch(`${API_URL}/feed/feeds/${code}/visibility?is_public=${val}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { setIsPublic(!val); }
  };

  const shareCode = async () => {
    await shareText(`Join my anonymous class feed on ClassChaos!\n\nFeed code: ${code}\n\nDownload the app and use this code to join.`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
      }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/feed')} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
        </Pressable>
        <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', flex: 1 }}>
          Group Info
        </Text>
        <Pressable onPress={() => setShowQR(true)} style={{ padding: 4 }}>
          <Ionicons name="qr-code-outline" size={22} color={Colors.cyan} />
        </Pressable>
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={() => (
          <View>
            {/* Group avatar + name */}
            <View style={{ alignItems: 'center', paddingVertical: 28, gap: 12 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: 'rgba(6,182,212,0.15)',
                borderWidth: 2, borderColor: 'rgba(6,182,212,0.4)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="people" size={36} color={Colors.cyan} />
              </View>
              <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>
                {feed?.name ?? code}
              </Text>
              <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
                {members.length} members · Messages expire in 24h
              </Text>
            </View>

            {/* Feed code + share + QR */}
            <View style={{ marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => { Haptics.selection(); shareCode(); }}
                style={{
                  flex: 1,
                  backgroundColor: Colors.bg.card,
                  borderRadius: BorderRadius.card,
                  borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)',
                  flexDirection: 'row', alignItems: 'center',
                  padding: 16, gap: 14,
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: 'rgba(6,182,212,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="link" size={20} color={Colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text.secondary, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
                    Invite code
                  </Text>
                  <Text style={{ color: Colors.cyan, fontSize: 18, fontFamily: 'Poppins_700Bold', letterSpacing: 3 }}>
                    {code}
                  </Text>
                </View>
                <Ionicons name="share-social-outline" size={20} color={Colors.cyan} />
              </Pressable>

              {/* QR button */}
              <Pressable
                onPress={() => { Haptics.light(); setShowQR(true); }}
                style={{
                  backgroundColor: Colors.bg.card,
                  borderRadius: BorderRadius.card,
                  borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)',
                  width: 64, alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Ionicons name="qr-code-outline" size={22} color={Colors.cyan} />
                <Text style={{ color: Colors.cyan, fontSize: 9, fontFamily: 'Poppins_600SemiBold' }}>QR</Text>
              </Pressable>
            </View>

            {/* Public toggle (admin only) */}
            {isAdmin && (
              <View style={{
                marginHorizontal: 16, marginBottom: 8,
                backgroundColor: Colors.bg.card, borderRadius: BorderRadius.card,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14,
              }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="globe-outline" size={20} color="#10b981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_600SemiBold' }}>Public Feed</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
                    {isPublic ? 'Visible in Discover tab' : 'Invite-only (private)'}
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={togglePublic}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(16,185,129,0.4)' }}
                  thumbColor={isPublic ? '#10b981' : '#666'}
                />
              </View>
            )}

            {/* Privacy notice */}
            <View style={{
              marginHorizontal: 16, marginBottom: 20,
              backgroundColor: 'rgba(6,182,212,0.06)',
              borderRadius: BorderRadius.card,
              borderWidth: 1, borderColor: 'rgba(6,182,212,0.12)',
              padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start',
            }}>
              <Ionicons name="lock-closed" size={16} color={Colors.cyan} style={{ marginTop: 1 }} />
              <Text style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_400Regular', flex: 1, lineHeight: 18 }}>
                All identities are anonymous. Usernames are randomly generated. No one — including admins — can see who said what.
              </Text>
            </View>

            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium', paddingHorizontal: 20, marginBottom: 8 }}>
              MEMBERS ({members.length})
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const color = memberColor(item.id);
          const isMe = item.id === store.myMemberId;
          return (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              paddingHorizontal: 16, paddingVertical: 12,
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: color + '22',
                borderWidth: 1.5, borderColor: color + '66',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
                  {item.username?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_500Medium' }}>
                    {item.username}
                  </Text>
                  {isMe && (
                    <View style={{ backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>You</Text>
                    </View>
                  )}
                  {item.is_admin && (
                    <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#f59e0b', fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 }}>
                  {item.weekly_message_count} messages this week
                </Text>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginLeft: 74 }} />
        )}
        ListEmptyComponent={loading ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <ActivityIndicator color={Colors.cyan} />
          </View>
        ) : null}
      />

      <QRModal code={code ?? ''} visible={showQR} onClose={() => setShowQR(false)} />
    </SafeAreaView>
  );
}
