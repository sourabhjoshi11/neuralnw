import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, RefreshControl,
  ActivityIndicator, StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Haptics } from '@/utils/compat';
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

const AVATAR_COLORS = ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6'];
function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type ApiFeed = {
  id: string; code: string; name: string;
  member_count: number; created_at: string;
  admin_id: string; is_public?: boolean;
};

function FeedItem({ feed, onPress, showJoin }: { feed: ApiFeed; onPress: () => void; showJoin?: boolean }) {
  const color = avatarColor(feed.id);
  return (
    <Pressable onPress={onPress} android_ripple={{ color: 'rgba(255,255,255,0.05)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{
          width: 52, height: 52, borderRadius: 26,
          backgroundColor: color + '22', borderWidth: 2, borderColor: color + '66',
          alignItems: 'center', justifyContent: 'center', marginRight: 14,
        }}>
          <Text style={{ color, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>{initials(feed.name)}</Text>
        </View>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text numberOfLines={1} style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold', flex: 1, marginRight: 8 }}>
              {feed.name}
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
              {timeAgo(feed.created_at)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: color + '20', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ color, fontSize: 11, fontFamily: 'Poppins_600SemiBold', letterSpacing: 1 }}>{feed.code}</Text>
            </View>
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
              {feed.member_count ?? 0} {(feed.member_count ?? 0) === 1 ? 'member' : 'members'}
            </Text>
            {feed.is_public && (
              <View style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#10b981', fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>PUBLIC</Text>
              </View>
            )}
          </View>
        </View>
        {showJoin ? (
          <View style={{ backgroundColor: Colors.cyan, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: '#000', fontSize: 12, fontFamily: 'Poppins_700Bold' }}>Join</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
        )}
      </View>
    </Pressable>
  );
}

function Separator() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 82 }} />;
}

export default function FeedTabScreen() {
  const { token } = useAuthStore();
  const { myFeeds, setMyFeeds, setFeed } = useFeedStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [discoverFeeds, setDiscoverFeeds] = useState<ApiFeed[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFeeds = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/feed/feeds`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) setMyFeeds(await resp.json());
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  const fetchDiscover = useCallback(async (q = '') => {
    if (!token) return;
    setDiscoverLoading(true);
    try {
      const resp = await fetch(`${API_URL}/feed/discover?q=${encodeURIComponent(q)}&limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) setDiscoverFeeds(await resp.json());
    } catch { /* silent */ }
    finally { setDiscoverLoading(false); }
  }, [token]);

  useEffect(() => { fetchFeeds(); }, [fetchFeeds]);
  useEffect(() => { if (tab === 'discover') fetchDiscover(searchQuery); }, [tab]);

  const onRefresh = () => { setRefreshing(true); fetchFeeds(true); };

  const myFeedCodes = new Set(myFeeds.map((f: any) => f.code));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg.primary} />

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
      }}>
        <Text style={{ color: Colors.text.primary, fontSize: 24, fontFamily: 'Poppins_700Bold' }}>Class Feeds</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={() => { Haptics.selection(); router.push('/feed/join'); }} style={{ padding: 8, borderRadius: 20 }}>
            <Ionicons name="enter-outline" size={22} color={Colors.cyan} />
          </Pressable>
          <Pressable onPress={() => { Haptics.medium(); router.push('/feed/create'); }} style={{ padding: 8, borderRadius: 20 }}>
            <Ionicons name="add" size={26} color={Colors.cyan} />
          </Pressable>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {(['mine', 'discover'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => { setTab(t); if (t === 'discover') fetchDiscover(searchQuery); }}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
              backgroundColor: tab === t ? Colors.cyan : 'rgba(255,255,255,0.06)',
              borderWidth: 1, borderColor: tab === t ? Colors.cyan : 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: tab === t ? '#000' : Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>
              {t === 'mine' ? 'My Feeds' : '🌐 Discover'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'mine' ? (
        loading && myFeeds.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.cyan} />
          </View>
        ) : (
          <FlatList
            data={myFeeds as unknown as ApiFeed[]}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FeedItem
                feed={item}
                onPress={() => { Haptics.selection(); setFeed(item as any); router.push(`/feed/${item.code}`); }}
              />
            )}
            ItemSeparatorComponent={Separator}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} colors={[Colors.cyan]} />}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 20 }}>
                <Text style={{ fontSize: 48 }}>💬</Text>
                <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>No feeds yet</Text>
                <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 40 }}>
                  Create a class feed or join one with an 8-character code
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <Pressable onPress={() => router.push('/feed/create')} style={{ backgroundColor: Colors.cyan, borderRadius: BorderRadius.btn, paddingHorizontal: 20, paddingVertical: 11 }}>
                    <Text style={{ color: '#000', fontSize: 14, fontFamily: 'Poppins_700Bold' }}>Create</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/feed/join')} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: BorderRadius.btn, paddingHorizontal: 20, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                    <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Poppins_700Bold' }}>Join</Text>
                  </Pressable>
                </View>
              </View>
            }
            contentContainerStyle={myFeeds.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.card, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 8 }}>
              <Ionicons name="search-outline" size={16} color={Colors.text.muted} />
              <TextInput
                style={{ flex: 1, color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular', paddingVertical: 10 }}
                placeholder="Search public feeds..."
                placeholderTextColor={Colors.text.muted}
                value={searchQuery}
                onChangeText={(v) => { setSearchQuery(v); fetchDiscover(v); }}
                returnKeyType="search"
              />
              {searchQuery ? (
                <Pressable onPress={() => { setSearchQuery(''); fetchDiscover(''); }}>
                  <Ionicons name="close-circle" size={16} color={Colors.text.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {discoverLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={Colors.cyan} />
            </View>
          ) : (
            <FlatList
              data={discoverFeeds}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <FeedItem
                  feed={item}
                  showJoin={!myFeedCodes.has(item.code)}
                  onPress={() => {
                    Haptics.selection();
                    if (myFeedCodes.has(item.code)) {
                      setFeed(item as any);
                      router.push(`/feed/${item.code}`);
                    } else {
                      router.push(`/feed/join?code=${item.code}`);
                    }
                  }}
                />
              )}
              ItemSeparatorComponent={Separator}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
                  <Text style={{ fontSize: 40 }}>🌐</Text>
                  <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>No public feeds found</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 40 }}>
                    Make your feed public from Group Info to appear here
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
