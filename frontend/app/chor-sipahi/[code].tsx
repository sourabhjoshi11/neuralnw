import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, SafeAreaView, ScrollView, TextInput,
  Alert, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withSequence, withRepeat, FadeIn, FadeOut, SlideInUp,
} from 'react-native-reanimated';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/theme';

const API_URL    = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';
const WS_URL     = process.env.EXPO_PUBLIC_WS_URL  ?? 'wss://api.classchaos.app';
const PING_MS    = 25_000;

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0, 80)}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'raja' | 'mantri' | 'sipahi' | 'chor' | null;
type Phase = 'lobby' | 'role_reveal' | 'discussion' | 'guessing' | 'result' | 'finished';

interface CSPlayer {
  id: string;
  userId: string;
  username: string;
  color: string;
  points: number;
  joinOrder: number;
  isBot: boolean;
  role: Role;
}

interface CSRound {
  id?: string;
  roundNumber: number;
  rajaId: string | null;
  mantriId: string | null;
  sipahiId: string | null;
  chorId: string | null;
  guessChorId: string | null;
  guessSipahiId: string | null;
  chorCaught: boolean | null;
  pointsAwarded: Record<string, number> | null;
}

interface GameState {
  roomCode: string;
  status: string;
  phase: Phase;
  currentRound: number;
  phaseEndsAt: string | null;
  players: CSPlayer[];
  round: CSRound | null;
}

interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  color: string;
  text: string;
}

const ROLE_INFO: Record<string, { emoji: string; label: string; color: string; desc: string }> = {
  raja:   { emoji: '👑', label: 'Raja',   color: '#f59e0b', desc: 'You are revealed. Sit back and watch!' },
  mantri: { emoji: '🧾', label: 'Mantri', color: '#8b5cf6', desc: 'Find the Chor! Observe everyone carefully.' },
  sipahi: { emoji: '👮', label: 'Sipahi', color: '#3b82f6', desc: 'Help Mantri catch the Chor!' },
  chor:   { emoji: '🕵️', label: 'Chor',   color: '#ef4444', desc: 'Stay hidden. Fool the Mantri!' },
};

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(phaseEndsAt: string | null): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!phaseEndsAt) { setSecs(0); return; }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(phaseEndsAt).getTime() - Date.now()) / 1000));
      setSecs(diff);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [phaseEndsAt]);
  return secs;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChorSipahiGame() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token, user } = useAuthStore();

  const [state, setState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [selectedChor, setSelectedChor] = useState<string | null>(null);
  const [selectedSipahi, setSelectedSipahi] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const wsRef    = useRef<WebSocket | null>(null);
  const pingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const countdown = useCountdown(state?.phaseEndsAt ?? null);
  const myPlayer  = state?.players.find((p) => p.id === myPlayerId) ?? null;
  const myRole    = myPlayer?.role ?? null;

  // ── Fetch initial state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !code) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/cs/rooms/${code}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { Alert.alert('Error', 'Room not found'); router.back(); return; }
        const data = await readJson(res) as GameState & { myPlayerId: string; isHost: boolean };
        setState(data);
        setMyPlayerId(data.myPlayerId);
        setIsHost(data.isHost);
      } catch {
        Alert.alert('Error', 'Could not load room');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [code, token]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !code || loading) return;
    const url = `${WS_URL}/ws/cs/${code}?token=${encodeURIComponent(token)}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      pingRef.current = setInterval(() => {
        ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' }));
      }, PING_MS);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'pong') return;

        if (msg.type === 'state_sync') {
          setState(msg.data as GameState);
        } else if (msg.type === 'chat') {
          setChatMsgs((prev) => [...prev.slice(-199), { id: Math.random().toString(), ...msg.data }]);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        } else if (msg.type === 'typing') {
          const name = msg.data.username;
          setTypingUsers((prev) => [...new Set([...prev, name])]);
          setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u !== name)), 2500);
        } else if (msg.type === 'reaction') {
          // Could add floating reactions — skip for now
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
    };

    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      ws.close();
    };
  }, [loading, code, token]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (starting || !token) return;
    setStarting(true);
    try {
      const res = await fetch(`${API_URL}/cs/rooms/${code}/start`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await readJson(res) as any;
        Alert.alert('Cannot start', d.detail ?? 'Error');
      }
    } catch { Alert.alert('Error', 'Could not start game'); }
    finally { setStarting(false); }
  };

  const handleGuess = async () => {
    if (!selectedChor || !selectedSipahi || guessing || !token) return;
    if (selectedChor === selectedSipahi) { Alert.alert('Invalid', 'Chor and Sipahi must be different players'); return; }
    setGuessing(true);
    try {
      const res = await fetch(`${API_URL}/cs/rooms/${code}/guess`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess_chor_id: selectedChor, guess_sipahi_id: selectedSipahi }),
      });
      if (!res.ok) {
        const d = await readJson(res) as any;
        Alert.alert('Error', d.detail ?? 'Could not submit guess');
      }
    } catch { Alert.alert('Error', 'Network error'); }
    finally { setGuessing(false); }
  };

  const handleNextRound = async () => {
    if (!token) return;
    await fetch(`${API_URL}/cs/rooms/${code}/next-round`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  };

  const sendChat = () => {
    const txt = chatText.trim();
    if (!txt || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'chat', text: txt }));
    setChatText('');
  };

  const sendTyping = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!typingRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'typing' }));
      typingRef.current = setTimeout(() => { typingRef.current = null; }, 2000);
    }
  };

  if (loading || !state) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 48 }}>🕵️</Text>
        <Text style={{ color: Colors.text.muted, fontFamily: 'Poppins_400Regular', marginTop: 12 }}>Loading room...</Text>
      </SafeAreaView>
    );
  }

  // ── Phase renders ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={18} color={Colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Harami vs Shurta</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>#{code} · Round {state.currentRound || '–'}</Text>
          </View>
          {countdown > 0 && (
            <View style={{ backgroundColor: countdown <= 10 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: countdown <= 10 ? Colors.red : Colors.purple }}>{countdown}s</Text>
            </View>
          )}
        </View>

        {/* Phase content */}
        <View style={{ flex: 1 }}>
          {state.phase === 'lobby' && <LobbyPhase state={state} myPlayerId={myPlayerId} isHost={isHost} onStart={handleStart} starting={starting} />}
          {state.phase === 'role_reveal' && <RoleRevealPhase myRole={myRole} countdown={countdown} />}
          {(state.phase === 'discussion' || state.phase === 'guessing') && (
            <DiscussionPhase
              state={state} myPlayerId={myPlayerId} myRole={myRole}
              chatMsgs={chatMsgs} typingUsers={typingUsers}
              chatText={chatText} setChatText={setChatText}
              sendChat={sendChat} sendTyping={sendTyping}
              scrollRef={scrollRef}
              selectedChor={selectedChor} setSelectedChor={setSelectedChor}
              selectedSipahi={selectedSipahi} setSelectedSipahi={setSelectedSipahi}
              onGuess={handleGuess} guessing={guessing}
            />
          )}
          {state.phase === 'result' && (
            <ResultPhase state={state} myPlayerId={myPlayerId} isHost={isHost} onNextRound={handleNextRound} countdown={countdown} />
          )}
          {state.phase === 'finished' && <FinishedPhase state={state} myPlayerId={myPlayerId} />}
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

function LobbyPhase({ state, myPlayerId, isHost, onStart, starting }: {
  state: GameState; myPlayerId: string | null; isHost: boolean;
  onStart: () => void; starting: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 56 }}>🎭</Text>
        <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Waiting for players</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>Need at least 3 to start</Text>
      </View>

      <View style={{ backgroundColor: Colors.bg.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {state.players.map((p, i) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.border }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: p.color + '33', borderWidth: 2, borderColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: p.color }}>{p.username[0]?.toUpperCase()}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{p.username}</Text>
            {p.id === myPlayerId && <Text style={{ fontSize: 11, color: Colors.purple, fontFamily: 'Poppins_600SemiBold' }}>YOU</Text>}
          </View>
        ))}
      </View>

      {isHost && (
        <Pressable
          onPress={onStart}
          disabled={starting || state.players.length < 3}
          style={{
            backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16,
            alignItems: 'center', opacity: (starting || state.players.length < 3) ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#fff' }}>
            {starting ? 'Starting...' : `Start Game (${state.players.length} players)`}
          </Text>
        </Pressable>
      )}
      {!isHost && (
        <View style={{ alignItems: 'center', padding: 16 }}>
          <Text style={{ color: Colors.text.muted, fontFamily: 'Poppins_400Regular' }}>Waiting for host to start...</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Role Reveal ─────────────────────────────────────────────────────────────

function RoleRevealPhase({ myRole, countdown }: { myRole: Role; countdown: number }) {
  const scale = useSharedValue(0);
  const info  = myRole ? ROLE_INFO[myRole] : null;

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
  }, []);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 }}>
      <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Your Role</Text>
      <Animated.View style={[anim, {
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: info ? info.color + '22' : Colors.bg.card,
        borderWidth: 3, borderColor: info?.color ?? Colors.border,
        alignItems: 'center', justifyContent: 'center',
      }]}>
        <Text style={{ fontSize: 72 }}>{info?.emoji ?? '❓'}</Text>
      </Animated.View>

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', color: info?.color ?? Colors.text.primary }}>{info?.label ?? '...'}</Text>
        <Text style={{ fontSize: 15, fontFamily: 'Poppins_400Regular', color: Colors.text.secondary, textAlign: 'center' }}>{info?.desc}</Text>
      </View>

      {countdown > 0 && (
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>Discussion starts in {countdown}s</Text>
      )}
    </View>
  );
}

// ─── Discussion + Guessing ───────────────────────────────────────────────────

function DiscussionPhase({
  state, myPlayerId, myRole,
  chatMsgs, typingUsers, chatText, setChatText, sendChat, sendTyping, scrollRef,
  selectedChor, setSelectedChor, selectedSipahi, setSelectedSipahi,
  onGuess, guessing,
}: any) {
  const isMantri = myRole === 'mantri';
  const isGuessing = state.phase === 'guessing';
  const raja = state.players.find((p: CSPlayer) => p.role === 'raja');

  return (
    <View style={{ flex: 1 }}>
      {/* Phase banner */}
      <View style={{
        marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12,
        backgroundColor: isGuessing ? 'rgba(139,92,246,0.15)' : 'rgba(6,182,212,0.1)',
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
        <Text style={{ fontSize: 18 }}>{isGuessing ? '🔍' : '💬'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: isGuessing ? Colors.purple : Colors.cyan }}>
            {isGuessing ? (isMantri ? 'Make your guess, Mantri!' : 'Mantri is guessing...') : 'Discussion Phase'}
          </Text>
          {raja && <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>👑 Raja: {raja.username}</Text>}
        </View>
        {myRole && (
          <View style={{ backgroundColor: ROLE_INFO[myRole]?.color + '33', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: ROLE_INFO[myRole]?.color }}>
              {ROLE_INFO[myRole]?.emoji} {ROLE_INFO[myRole]?.label}
            </Text>
          </View>
        )}
      </View>

      {/* Mantri guess UI */}
      {isMantri && isGuessing && (
        <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.bg.card, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.purple + '44' }}>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>🔍 Who is who?</Text>
          <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>Tap to select Chor then Sipahi</Text>
          <View style={{ gap: 6 }}>
            {state.players
              .filter((p: CSPlayer) => p.role !== 'raja' && p.id !== myPlayerId)
              .map((p: CSPlayer) => {
                const isChor   = selectedChor === p.id;
                const isSipahi = selectedSipahi === p.id;
                return (
                  <View key={p.id} style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => setSelectedChor(isChor ? null : p.id)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                        padding: 10, borderRadius: 10,
                        backgroundColor: isChor ? 'rgba(239,68,68,0.2)' : Colors.bg.primary,
                        borderWidth: 1, borderColor: isChor ? Colors.red : Colors.border,
                      }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p.color + '33', borderWidth: 1.5, borderColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: p.color }}>{p.username[0]?.toUpperCase()}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{p.username}</Text>
                      {isChor && <Text style={{ fontSize: 12, color: Colors.red }}>🕵️ Chor</Text>}
                    </Pressable>
                    <Pressable
                      onPress={() => setSelectedSipahi(isSipahi ? null : p.id)}
                      style={{
                        paddingHorizontal: 10, borderRadius: 10, justifyContent: 'center',
                        backgroundColor: isSipahi ? 'rgba(59,130,246,0.2)' : Colors.bg.primary,
                        borderWidth: 1, borderColor: isSipahi ? Colors.blue : Colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{isSipahi ? '👮' : '❓'}</Text>
                    </Pressable>
                  </View>
                );
              })}
          </View>
          <Pressable
            onPress={onGuess}
            disabled={!selectedChor || !selectedSipahi || guessing}
            style={{
              backgroundColor: Colors.purple, borderRadius: 12, paddingVertical: 12,
              alignItems: 'center', opacity: (!selectedChor || !selectedSipahi || guessing) ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>
              {guessing ? 'Submitting...' : 'Submit Guess'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Chat */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {chatMsgs.map((m: ChatMessage) => (
          <View key={m.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: m.color + '33', borderWidth: 1.5, borderColor: m.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: m.color }}>{m.username[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: m.color, marginBottom: 2 }}>{m.username}</Text>
              <View style={{ backgroundColor: Colors.bg.card, borderRadius: 12, borderTopLeftRadius: 2, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.primary }}>{m.text}</Text>
              </View>
            </View>
          </View>
        ))}
        {typingUsers.length > 0 && (
          <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted, paddingLeft: 36 }}>
            {typingUsers.join(', ')} typing...
          </Text>
        )}
      </ScrollView>

      {/* Chat input */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8, backgroundColor: '#0d1117', borderTopWidth: 1, borderTopColor: Colors.border }}>
        <TextInput
          value={chatText}
          onChangeText={(v) => { setChatText(v); sendTyping(); }}
          placeholder="Say something suspicious..."
          placeholderTextColor={Colors.text.muted}
          style={{
            flex: 1, backgroundColor: Colors.bg.card, borderRadius: 22, paddingHorizontal: 16,
            paddingVertical: 10, color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular',
          }}
          multiline maxLength={300}
          onSubmitEditing={sendChat} returnKeyType="send" blurOnSubmit
        />
        <Pressable
          onPress={sendChat}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatText.trim() ? '#25D366' : Colors.bg.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="send" size={18} color={chatText.trim() ? '#fff' : Colors.text.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Result ───────────────────────────────────────────────────────────────────

function ResultPhase({ state, myPlayerId, isHost, onNextRound, countdown }: {
  state: GameState; myPlayerId: string | null; isHost: boolean;
  onNextRound: () => void; countdown: number;
}) {
  const round = state.round;
  const chorCaught = round?.chorCaught ?? false;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>

      {/* Result banner */}
      <Animated.View entering={FadeIn.duration(400)} style={{
        backgroundColor: chorCaught ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
        borderRadius: 20, padding: 24, alignItems: 'center', gap: 8,
        borderWidth: 1, borderColor: chorCaught ? Colors.blue : Colors.red,
      }}>
        <Text style={{ fontSize: 56 }}>{chorCaught ? '👮' : '🕵️'}</Text>
        <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: chorCaught ? Colors.blue : Colors.red }}>
          {chorCaught ? 'Chor Caught!' : 'Chor Escaped!'}
        </Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.secondary, textAlign: 'center' }}>
          {chorCaught ? 'Mantri guessed correctly. Law wins!' : 'Mantri was fooled. Chor wins this round!'}
        </Text>
      </Animated.View>

      {/* Players with roles + points */}
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1 }}>Roles Revealed</Text>
      <View style={{ backgroundColor: Colors.bg.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {state.players
          .sort((a, b) => b.points - a.points)
          .map((p, i) => {
            const info = p.role ? ROLE_INFO[p.role] : null;
            const pts  = round?.pointsAwarded?.[p.id] ?? 0;
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.border }}>
                <Text style={{ fontSize: 22 }}>{info?.emoji ?? '❓'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>
                    {p.username} {p.id === myPlayerId ? '(You)' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: info?.color ?? Colors.text.muted }}>{info?.label ?? '?'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {pts > 0 && (
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.green }}>+{pts}</Text>
                  )}
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary }}>{p.points} pts</Text>
                </View>
              </View>
            );
          })}
      </View>

      {/* Next round */}
      {isHost ? (
        <Pressable
          onPress={onNextRound}
          style={{ backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#fff' }}>
            Next Round {countdown > 0 ? `(auto in ${countdown}s)` : ''}
          </Text>
        </Pressable>
      ) : (
        <View style={{ alignItems: 'center', padding: 12 }}>
          <Text style={{ color: Colors.text.muted, fontFamily: 'Poppins_400Regular' }}>
            {countdown > 0 ? `Next round in ${countdown}s...` : 'Waiting for host...'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Finished ─────────────────────────────────────────────────────────────────

function FinishedPhase({ state, myPlayerId }: { state: GameState; myPlayerId: string | null }) {
  const sorted  = [...state.players].sort((a, b) => b.points - a.points);
  const winner  = sorted[0];
  const medals  = ['🥇', '🥈', '🥉'];

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20, alignItems: 'center' }}>
      <Text style={{ fontSize: 64 }}>🏆</Text>
      <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: Colors.yellow, textAlign: 'center' }}>
        Game Over!
      </Text>
      <Text style={{ fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary, textAlign: 'center' }}>
        {winner?.username} wins with {winner?.points} pts!
      </Text>

      <View style={{ width: '100%', backgroundColor: Colors.bg.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {sorted.map((p, i) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.border }}>
            <Text style={{ fontSize: 22, width: 32 }}>{medals[i] ?? `${i + 1}.`}</Text>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: p.color + '33', borderWidth: 2, borderColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: p.color }}>{p.username[0]?.toUpperCase()}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: p.id === myPlayerId ? Colors.purple : Colors.text.primary }}>
              {p.username} {p.id === myPlayerId ? '(You)' : ''}
            </Text>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.yellow }}>{p.points}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => router.replace('/(tabs)/games')}
        style={{ width: '100%', backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 }}
      >
        <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Back to Games</Text>
      </Pressable>
    </ScrollView>
  );
}
