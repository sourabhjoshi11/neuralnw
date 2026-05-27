import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  Alert, KeyboardAvoidingView, Platform, StatusBar, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withSequence, withRepeat, withDelay, FadeIn, SlideInUp, ZoomIn,
  interpolate, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/theme';
import { Haptics, shareText } from '@/utils/compat';
import { playSound, initGameSounds } from '@/utils/gameSound';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://api.classchaos.app';
const PING_MS = 25_000;
const HEADER_TOP_PADDING = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 12;

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0, 80)}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'malik' | 'wazir' | 'shurta' | 'harami' | null;
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
  malikId: string | null;
  wazirId: string | null;
  shurtaId: string | null;
  haramiId: string | null;
  guessHaramiId: string | null;
  guessShurtaId: string | null;
  haramiCaught: boolean | null;
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
  timestamp: number;
}

interface GuessPreview {
  wazirId: string;
  guessHaramiId: string | null;
  guessShurtaId: string | null;
}

interface DiscussionPhaseProps {
  state: GameState;
  myPlayerId: string | null;
  myRole: Role;
  chatMsgs: ChatMessage[];
  typingUsers: string[];
  chatText: string;
  setChatText: (v: string) => void;
  sendChat: () => void;
  sendTyping: () => void;
  scrollRef: React.RefObject<ScrollView | null>;
  selectedHarami: string | null;
  setSelectedHarami: (v: string | null) => void;
  selectedShurta: string | null;
  setSelectedShurta: (v: string | null) => void;
  guessPreview: GuessPreview | null;
  sendGuessPreview: (haramiId: string | null, shurtaId: string | null) => void;
  countdown: number;
  onGuess: () => void;
  guessing: boolean;
  isAtChatBottom: boolean;
  setIsAtChatBottom: (v: boolean) => void;
}

const ROLE_INFO: Record<string, { emoji: string; label: string; color: string; desc: string }> = {
  malik: { emoji: '👑', label: 'Malik', color: '#f59e0b', desc: 'You are revealed. Sit back and watch!' },
  wazir: { emoji: '🧾', label: 'Wazir', color: '#8b5cf6', desc: 'Find the Harami! Observe everyone carefully.' },
  shurta: { emoji: '👮', label: 'Shurta', color: '#3b82f6', desc: 'Help Wazir catch the Harami!' },
  harami: { emoji: '🕵️', label: 'Harami', color: '#ef4444', desc: 'Stay hidden. Fool the Wazir!' },
};

const ROLE_ORDER = ['malik', 'wazir', 'shurta', 'harami'] as const;

// ─── Countdown hook (fixed: uses ref to avoid effect re-creation) ─────────────

function useCountdown(phaseEndsAt: string | null): number {
  const [secs, setSecs] = useState(0);
  const lastSecRef = useRef(0);

  useEffect(() => {
    if (!phaseEndsAt) { setSecs(0); return; }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(phaseEndsAt).getTime() - Date.now()) / 1000));
      setSecs(diff);
      if (diff <= 5 && diff > 0 && diff !== lastSecRef.current) {
        playSound('tick');
        lastSecRef.current = diff;
      }
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [phaseEndsAt]);

  return secs;
}


// ─── Animated helpers ─────────────────────────────────────────────────────────

function RoleSignalBackdrop({ color = Colors.purple }: { color?: string }) {
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 2600 }), -1, false);
  }, []);

  const beamA = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [0, 0.5, 1], [0.08, 0.24, 0.08]),
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-180, 220]) }, { rotate: '-18deg' }],
  }));

  const beamB = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [0, 0.5, 1], [0.18, 0.06, 0.18]),
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [220, -180]) }, { rotate: '18deg' }],
  }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Animated.View style={[{
        position: 'absolute', top: 32, left: -120, width: 170, height: 420,
        backgroundColor: color, borderRadius: 18,
      }, beamA]} />
      <Animated.View style={[{
        position: 'absolute', bottom: -80, right: -120, width: 150, height: 360,
        backgroundColor: Colors.cyan, borderRadius: 18,
      }, beamB]} />
    </View>
  );
}

function RoleTicker() {
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = withRepeat(withTiming(1, { duration: 3600 }), -1, true);
  }, []);

  const railStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shift.value, [0, 1], [-12, 12]) }],
  }));

  return (
    <Animated.View style={[{ flexDirection: 'row', gap: 8, marginTop: 4 }, railStyle]}>
      {ROLE_ORDER.map((role) => {
        const info = ROLE_INFO[role];
        return (
          <View
            key={role}
            style={{
              width: 62, height: 70, borderRadius: 16,
              backgroundColor: info.color + '22',
              borderWidth: 1, borderColor: info.color + '66',
              alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <Text style={{ fontSize: 24 }}>{info.emoji}</Text>
            <Text style={{ color: info.color, fontSize: 10, fontFamily: 'Poppins_700Bold' }}>{info.label}</Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

function FloatingSignal({ emoji, top, left, delay = 0 }: { emoji: string; top: number; left: number; delay?: number }) {
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300 }), -1, true));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(float.value, [0, 1], [0.45, 1]),
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -10]) }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top, left }, style]}>
      <Text style={{ fontSize: 24 }}>{emoji}</Text>
    </Animated.View>
  );
}

function HiddenRoleCircle({ players }: { players: CSPlayer[] }) {
  const spin = useSharedValue(0);
  const visible = players.slice(0, 6);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 4200 }), -1, true);
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(spin.value, [0, 1], [-3, 3])}deg` }],
  }));

  return (
    <Animated.View style={[{ width: 260, height: 210, alignSelf: 'center' }, ringStyle]}>
      <View style={{ position: 'absolute', left: 99, top: 66, width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.purple + '22', borderWidth: 1, borderColor: Colors.purple + '66', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="help" size={30} color={Colors.purple} />
      </View>
      {visible.map((p, i) => {
        const angle = (Math.PI * 2 * i) / Math.max(visible.length, 1) - Math.PI / 2;
        const cx = 108 + Math.cos(angle) * 90;
        const cy = 74 + Math.sin(angle) * 62;
        return (
          <Animated.View
            key={p.id}
            entering={ZoomIn.delay(i * 120).springify()}
            style={{ position: 'absolute', left: cx, top: cy, width: 44, height: 54, alignItems: 'center' }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: p.color + '30', borderWidth: 1.5, borderColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>?</Text>
            </View>
            <Text style={{ marginTop: 3, maxWidth: 56, fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: Colors.text.muted }} numberOfLines={1}>
              {p.username}
            </Text>
          </Animated.View>
        );
      })}
      <FloatingSignal emoji="😎" top={8} left={36} />
      <FloatingSignal emoji="😰" top={28} left={202} delay={240} />
      <FloatingSignal emoji="👀" top={154} left={124} delay={480} />
    </Animated.View>
  );
}


function DraggablePlayer({
  player, assignedRole, onDragStart, onDragEnd, disabled,
}: {
  player: CSPlayer; assignedRole?: 'harami' | 'shurta';
  onDragStart: () => void; onDragEnd: (x: number, y: number) => void;
  disabled?: boolean;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const doHaptic = useCallback(() => Haptics.longPress(), []);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.3);
      runOnJS(doHaptic)();
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      scale.value = withSpring(1);
      runOnJS(onDragEnd)(e.absoluteX, e.absoluteY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: isDragging.value ? 1000 : 1,
    opacity: isDragging.value ? 0.95 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ alignItems: 'center', gap: 6, padding: 8 }, animStyle]}>
        <View style={{
          width: 64, height: 64, borderRadius: 32,
          backgroundColor: player.color + '33',
          borderWidth: 2.5,
          borderColor: assignedRole === 'harami' ? Colors.red : assignedRole === 'shurta' ? Colors.blue : player.color,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: player.color, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
        }}>
          <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: player.color }}>
            {player.username[0]?.toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary, maxWidth: 80, textAlign: 'center' }} numberOfLines={1}>
          {player.username}
        </Text>
        {assignedRole && (
          <View style={{ backgroundColor: assignedRole === 'harami' ? Colors.red + '22' : Colors.blue + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: assignedRole === 'harami' ? Colors.red : Colors.blue, textTransform: 'uppercase' }}>
              {assignedRole}
            </Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function DropSpot({
  title, color, icon, player, active, readOnly, onDrop, onClear, onLayout,
}: {
  title: string; color: string; icon: keyof typeof Ionicons.glyphMap; player?: CSPlayer | null;
  active: boolean; readOnly: boolean; onDrop: () => void; onClear: () => void;
  onLayout?: (layout: { x: number; y: number; width: number; height: number }) => void;
}) {
  const pulse = useSharedValue(0);
  const dropScale = useSharedValue(player ? 1 : 0);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    if (active && !player) {
      pulse.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    } else {
      pulse.value = 0;
    }
  }, [active, player]);

  useEffect(() => {
    dropScale.value = withSpring(player ? 1 : 0, { damping: 12, stiffness: 180 });
  }, [player]);

  const handleLayout = useCallback(() => {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      onLayout?.({ x, y, width, height });
    });
  }, [onLayout]);

  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: active && !player
      ? `rgba(${color === Colors.red ? '239,68,68' : '59,130,246'},${interpolate(pulse.value, [0, 1], [0.3, 0.8])})`
      : player ? color : Colors.border,
    transform: [{ scale: active && !player ? interpolate(pulse.value, [0, 1], [1, 1.02]) : 1 }],
  }));

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dropScale.value }],
    opacity: dropScale.value,
  }));

  return (
    <View ref={viewRef} onLayout={handleLayout} style={{ flex: 1, minHeight: 140 }}>
      <Animated.View
        style={[{
          flex: 1, borderRadius: 16, padding: 16, gap: 10,
          backgroundColor: player ? color + '18' : Colors.bg.primary,
          borderWidth: active && !player ? 3 : 1.5,
          borderStyle: player ? 'solid' : 'dashed',
          shadowColor: active && !player ? color : 'transparent',
          shadowOpacity: active && !player ? 0.5 : 0,
          shadowRadius: active && !player ? 12 : 0,
          elevation: active && !player ? 8 : 0,
        }, pulseStyle]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name={icon} size={17} color={color} />
          <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color, textTransform: 'uppercase' }}>{title}</Text>
        </View>
        {player ? (
          <Animated.View entering={ZoomIn.springify()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Animated.View style={[avatarStyle, { width: 34, height: 34, borderRadius: 17, backgroundColor: player.color + '33', borderWidth: 1.5, borderColor: player.color, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: player.color }}>{player.username[0]?.toUpperCase()}</Text>
            </Animated.View>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }} numberOfLines={1}>
              {player.username}
            </Text>
            {!readOnly && (
              <Pressable onPress={onClear} style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg.card }}>
                <Ionicons name="close" size={15} color={Colors.text.muted} />
              </Pressable>
            )}
          </Animated.View>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 48, opacity: active ? 0.8 : 0.4 }}>
              {title === 'Harami' ? '🕵️' : '👮'}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: active ? color : Colors.text.muted, textAlign: 'center' }}>
              {readOnly ? 'Waiting...' : active ? 'Drop Here!' : 'Drag Player'}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}


function ResultScene({ haramiCaught }: { haramiCaught: boolean }) {
  const chase = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    chase.value = withTiming(1, { duration: 900 });
    pop.value = withSequence(withTiming(1, { duration: 250 }), withSpring(0.92), withSpring(1));
  }, []);

  const policeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(chase.value, [0, 1], [-130, haramiCaught ? 42 : 98]) }],
  }));
  const haramiStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: haramiCaught ? 0 : interpolate(chase.value, [0, 1], [0, 86]) },
      { scale: haramiCaught ? interpolate(pop.value, [0, 1], [0.9, 1]) : 1 },
    ],
    opacity: haramiCaught ? 1 : interpolate(chase.value, [0, 1], [1, 0.45]),
  }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pop.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <View style={{ width: '100%', height: 138, justifyContent: 'center', overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', left: '50%', marginLeft: -44, alignItems: 'center' }, haramiStyle]}>
        <Text style={{ fontSize: 56 }}>{haramiCaught ? '😈' : '💨'}</Text>
        <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: haramiCaught ? Colors.red : Colors.yellow }}>
          {haramiCaught ? 'MASK FOUND' : 'HAHAHA'}
        </Text>
      </Animated.View>
      <Animated.Text style={[{ position: 'absolute', left: 4, fontSize: 42 }, policeStyle]}>🚔 ➜ ➜</Animated.Text>
      <Animated.View style={[{ position: 'absolute', alignSelf: 'center', top: 6 }, markStyle]}>
        <Text style={{ fontSize: haramiCaught ? 40 : 64 }}>{haramiCaught ? '🔒' : '✕'}</Text>
      </Animated.View>
    </View>
  );
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
  const [selectedHarami, setSelectedHarami] = useState<string | null>(null);
  const [selectedShurta, setSelectedShurta] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [guessPreview, setGuessPreview] = useState<GuessPreview | null>(null);
  const [isAtChatBottom, setIsAtChatBottom] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const countdown = useCountdown(state?.phaseEndsAt ?? null);
  const myPlayer = state?.players.find((p) => p.id === myPlayerId) ?? null;
  const myRole = myPlayer?.role ?? null;

  // Reset selections on round/phase change
  useEffect(() => {
    setSelectedHarami(null);
    setSelectedShurta(null);
    setGuessPreview(null);
  }, [state?.currentRound]);

  useEffect(() => {
    if (state?.phase !== 'guessing') {
      setSelectedHarami(null);
      setSelectedShurta(null);
      setGuessPreview(null);
    }
  }, [state?.phase]);

  // ── Fetch initial state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !code) return;
    (async () => {
      try {
        await initGameSounds();
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
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect() {
      if (!alive) return;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, PING_MS);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'pong') return;

          if (msg.type === 'state_sync') {
            setState(msg.data as GameState);
            if ((msg.data as GameState).phase !== 'guessing') setGuessPreview(null);
          } else if (msg.type === 'chat') {
            setChatMsgs((prev) => [...prev.slice(-199), { id: Math.random().toString(), timestamp: Date.now(), ...msg.data }]);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
          } else if (msg.type === 'typing') {
            const name = msg.data.username as string;
            setTypingUsers((prev) => [...new Set([...prev, name])]);
            setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u !== name)), 2500);
          } else if (msg.type === 'guess_preview') {
            setGuessPreview(msg.data as GuessPreview);
          }
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => { setWsConnected(false); };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingRef.current) clearInterval(pingRef.current);
        wsRef.current = null;
        if (alive) reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingRef.current) clearInterval(pingRef.current);
      ws?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [loading, code, token]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (starting || !token) return;
    setStarting(true);
    try {
      const res = await fetch(`${API_URL}/cs/rooms/${code}/start`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await readJson(res) as { detail?: string };
        Alert.alert('Cannot start', d.detail ?? 'Error');
      }
    } catch { Alert.alert('Error', 'Could not start game'); }
    finally { setStarting(false); }
  };

  const handleGuess = async () => {
    if (!selectedHarami || !selectedShurta || guessing || !token) return;
    if (selectedHarami === selectedShurta) { Alert.alert('Invalid', 'Harami and Shurta must be different players'); return; }
    setGuessing(true);
    try {
      const res = await fetch(`${API_URL}/cs/rooms/${code}/guess`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess_chor_id: selectedHarami, guess_sipahi_id: selectedShurta }),
      });
      if (!res.ok) {
        const d = await readJson(res) as { detail?: string };
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

  const sendGuessPreview = useCallback((guessHaramiId: string | null, guessShurtaId: string | null) => {
    if (!myPlayerId) return;
    setGuessPreview({ wazirId: myPlayerId, guessHaramiId, guessShurtaId });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'guess_preview', guessHaramiId, guessShurtaId }));
    }
  }, [myPlayerId]);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: HEADER_TOP_PADDING, paddingBottom: 10, gap: 8 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={18} color={Colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Harami vs Shurta</Text>
              {!wsConnected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.red }} />}
            </View>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>
              #{code} · Round {state.currentRound || '–'}
            </Text>
          </View>
          <Pressable onPress={() => setShowTutorial(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.cyan} />
          </Pressable>
          {countdown > 0 && (
            <Animated.View
              entering={ZoomIn.springify()}
              style={{
                backgroundColor: countdown <= 10 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.2)',
                borderRadius: countdown <= 10 ? 999 : 10,
                paddingHorizontal: countdown <= 10 ? 16 : 10,
                paddingVertical: countdown <= 10 ? 10 : 4,
                borderWidth: countdown <= 10 ? 2 : 0,
                borderColor: countdown <= 10 ? Colors.red : 'transparent',
              }}
            >
              <Text style={{ fontSize: countdown <= 10 ? 24 : 16, fontFamily: 'Poppins_700Bold', color: countdown <= 10 ? Colors.red : Colors.purple }}>
                {countdown}s
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Offline banner */}
        {!wsConnected && (
          <Animated.View
            entering={SlideInUp.springify()}
            style={{ backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Reconnecting...</Text>
          </Animated.View>
        )}

        {/* Phase content */}
        <View style={{ flex: 1 }}>
          {state.phase === 'lobby' && <LobbyPhase state={state} myPlayerId={myPlayerId} isHost={isHost} onStart={handleStart} starting={starting} />}
          {state.phase === 'role_reveal' && <RoleRevealPhase state={state} myRole={myRole} countdown={countdown} />}
          {(state.phase === 'discussion' || state.phase === 'guessing') && (
            <DiscussionPhase
              state={state} myPlayerId={myPlayerId} myRole={myRole}
              chatMsgs={chatMsgs} typingUsers={typingUsers}
              chatText={chatText} setChatText={setChatText}
              sendChat={sendChat} sendTyping={sendTyping}
              scrollRef={scrollRef}
              selectedHarami={selectedHarami} setSelectedHarami={setSelectedHarami}
              selectedShurta={selectedShurta} setSelectedShurta={setSelectedShurta}
              guessPreview={guessPreview} sendGuessPreview={sendGuessPreview}
              countdown={countdown}
              onGuess={handleGuess} guessing={guessing}
              isAtChatBottom={isAtChatBottom} setIsAtChatBottom={setIsAtChatBottom}
            />
          )}
          {state.phase === 'result' && (
            <ResultPhase state={state} myPlayerId={myPlayerId} isHost={isHost} onNextRound={handleNextRound} countdown={countdown} />
          )}
          {state.phase === 'finished' && <FinishedPhase state={state} myPlayerId={myPlayerId} />}
        </View>

        {/* Tutorial Modal */}
        <Modal visible={showTutorial} transparent animationType="slide" onRequestClose={() => setShowTutorial(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }} onPress={() => setShowTutorial(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: Colors.bg.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingTop: 8 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 }} />
                <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ paddingHorizontal: 24, gap: 20 }}>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>How to Play</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.muted, textAlign: 'center' }}>
                      4 players, 4 roles. Find the Harami before time runs out!
                    </Text>
                  </View>
                  {ROLE_ORDER.map((role) => {
                    const info = ROLE_INFO[role];
                    return (
                      <View key={role} style={{ flexDirection: 'row', gap: 12, padding: 14, backgroundColor: info.color + '15', borderRadius: 14, borderWidth: 1, borderColor: info.color + '33' }}>
                        <Text style={{ fontSize: 32 }}>{info.emoji}</Text>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: info.color }}>{info.label}</Text>
                          <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.secondary, lineHeight: 18 }}>{info.desc}</Text>
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ gap: 12, padding: 16, backgroundColor: Colors.bg.primary, borderRadius: 14 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Game Flow</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.text.secondary, lineHeight: 20 }}>
                      1. Everyone gets a secret role{'\n'}
                      2. Malik is revealed to all{'\n'}
                      3. Discuss and find clues{'\n'}
                      4. Wazir guesses Harami & Shurta{'\n'}
                      5. If correct, +10 points. If wrong, Harami wins!
                    </Text>
                  </View>
                </ScrollView>
                <Pressable onPress={() => setShowTutorial(false)} style={{ marginHorizontal: 24, marginTop: 16, backgroundColor: Colors.purple, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Got it!</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

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
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 22, overflow: 'hidden' }}>
        <Text style={{ fontSize: 56 }}>🎭</Text>
        <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Waiting for players</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>Need 4 players to start</Text>
        <Pressable
          onPress={() => shareText(`Join my Harami vs Shurta game! 🎭\n\nCode: ${state.roomCode}\n\nOpen: classchaos://join/game/${state.roomCode}`)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' }}
        >
          <Ionicons name="share-outline" size={16} color={Colors.purple} />
          <Text style={{ color: Colors.purple, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>Invite Friends · {state.roomCode}</Text>
        </Pressable>
        <RoleTicker />
      </View>

      <View style={{ backgroundColor: Colors.bg.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {state.players.map((p, i) => (
          <Animated.View
            key={p.id}
            entering={SlideInUp.delay(i * 70).springify()}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.border }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: p.color + '33', borderWidth: 2, borderColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: p.color }}>{p.username[0]?.toUpperCase()}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{p.username}</Text>
            {p.id === myPlayerId && <Text style={{ fontSize: 11, color: Colors.purple, fontFamily: 'Poppins_600SemiBold' }}>YOU</Text>}
          </Animated.View>
        ))}
      </View>

      {isHost && (
        <Pressable
          onPress={onStart}
          disabled={starting || state.players.length < 4}
          style={{
            backgroundColor: Colors.purple, borderRadius: 16, paddingVertical: 16,
            alignItems: 'center', opacity: (starting || state.players.length < 4) ? 0.5 : 1,
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

function RoleRevealPhase({ state, myRole, countdown }: { state: GameState; myRole: Role; countdown: number }) {
  const scale = useSharedValue(0);
  const pulse = useSharedValue(0);
  const tilt = useSharedValue(-8);
  const info = myRole ? ROLE_INFO[myRole] : null;

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
    tilt.value = withSequence(
      withTiming(6, { duration: 420 }),
      withSpring(0, { damping: 8, stiffness: 120 }),
    );
    playSound('reveal');
  }, []);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotateZ: `${tilt.value}deg` }],
  }));
  const ringAnim = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.22, 0.62]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.92, 1.12]) }],
  }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 16, overflow: 'hidden' }}>
      <HiddenRoleCircle players={state.players} />
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Your Role</Text>
      <Animated.View style={[ringAnim, {
        position: 'absolute', bottom: 112, width: 178, height: 178, borderRadius: 89,
        borderWidth: 2, borderColor: info?.color ?? Colors.border,
      }]} />
      <Animated.View style={[anim, {
        width: 142, height: 142, borderRadius: 30,
        backgroundColor: info ? info.color + '22' : Colors.bg.card,
        borderWidth: 3, borderColor: info?.color ?? Colors.border,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: info?.color ?? Colors.purple, shadowOpacity: 0.45, shadowRadius: 18, elevation: 10,
      }]}>
        <Text style={{ fontSize: 58 }}>{info?.emoji ?? '❓'}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(260).duration(500)} style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 30, fontFamily: 'Poppins_700Bold', color: info?.color ?? Colors.text.primary }}>{info?.label ?? '...'}</Text>
        <Text style={{ fontSize: 15, fontFamily: 'Poppins_400Regular', color: Colors.text.secondary, textAlign: 'center' }}>{info?.desc}</Text>
      </Animated.View>

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
  selectedHarami, setSelectedHarami, selectedShurta, setSelectedShurta,
  guessPreview, sendGuessPreview,
  countdown, onGuess, guessing, isAtChatBottom, setIsAtChatBottom,
}: DiscussionPhaseProps) {
  const isWazir = myRole === 'wazir';
  const isGuessing = state.phase === 'guessing';
  const malik = state.players.find((p) => p.role === 'malik');
  const wazir = state.players.find((p) => p.role === 'wazir') ?? state.players.find((p) => p.id === state.round?.wazirId);
  const activeHaramiId = isWazir ? selectedHarami : guessPreview?.guessHaramiId;
  const activeShurtaId = isWazir ? selectedShurta : guessPreview?.guessShurtaId;
  const suspects = state.players.filter((p) => p.id !== malik?.id && p.id !== wazir?.id);
  const selectedHaramiPlayer = state.players.find((p) => p.id === activeHaramiId);
  const selectedShurtaPlayer = state.players.find((p) => p.id === activeShurtaId);
  const [heldPlayerId, setHeldPlayerId] = useState<string | null>(null);
  const [haramiZone, setHaramiZone] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [shurtaZone, setShurtaZone] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const bannerPulse = useSharedValue(0);

  const checkDrop = useCallback((x: number, y: number, playerId: string) => {
    let dropped = false;
    if (haramiZone && x >= haramiZone.x && x <= haramiZone.x + haramiZone.width && y >= haramiZone.y && y <= haramiZone.y + haramiZone.height) {
      pickHarami(playerId);
      Haptics.medium();
      dropped = true;
    } else if (shurtaZone && x >= shurtaZone.x && x <= shurtaZone.x + shurtaZone.width && y >= shurtaZone.y && y <= shurtaZone.y + shurtaZone.height) {
      pickShurta(playerId);
      Haptics.medium();
      dropped = true;
    }
    if (!dropped) Haptics.light();
    setHeldPlayerId(null);
  }, [haramiZone, shurtaZone, selectedHarami, selectedShurta]);

  useEffect(() => {
    bannerPulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, []);

  const bannerAnim = useAnimatedStyle(() => ({
    transform: [{ scale: isGuessing ? interpolate(bannerPulse.value, [0, 1], [1, 1.015]) : 1 }],
    borderColor: isGuessing
      ? `rgba(139,92,246,${interpolate(bannerPulse.value, [0, 1], [0.28, 0.7])})`
      : 'rgba(6,182,212,0.24)',
  }));

  const pickHarami = (id: string) => {
    Haptics.light();
    const nextHarami = selectedHarami === id ? null : id;
    const nextShurta = selectedShurta === id ? null : selectedShurta;
    setSelectedHarami(nextHarami);
    setSelectedShurta(nextShurta);
    sendGuessPreview(nextHarami, nextShurta);
  };

  const pickShurta = (id: string) => {
    Haptics.light();
    const nextShurta = selectedShurta === id ? null : id;
    const nextHarami = selectedHarami === id ? null : selectedHarami;
    setSelectedShurta(nextShurta);
    setSelectedHarami(nextHarami);
    sendGuessPreview(nextHarami, nextShurta);
  };

  const dropHeld = (role: 'harami' | 'shurta') => {
    if (!heldPlayerId) return;
    Haptics.medium();
    if (role === 'harami') pickHarami(heldPlayerId);
    else pickShurta(heldPlayerId);
    setHeldPlayerId(null);
  };

  const clearRole = (role: 'harami' | 'shurta') => {
    Haptics.light();
    const nextHarami = role === 'harami' ? null : selectedHarami;
    const nextShurta = role === 'shurta' ? null : selectedShurta;
    setSelectedHarami(nextHarami);
    setSelectedShurta(nextShurta);
    sendGuessPreview(nextHarami, nextShurta);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Phase banner */}
      <Animated.View entering={SlideInUp.duration(360)} style={[{
        marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12,
        backgroundColor: isGuessing ? 'rgba(139,92,246,0.15)' : 'rgba(6,182,212,0.1)',
        flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1,
      }, bannerAnim]}>
        <Text style={{ fontSize: 18 }}>{isGuessing ? '🔍' : '💬'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: isGuessing ? Colors.purple : Colors.cyan }}>
            {isGuessing ? (isWazir ? 'Make your guess, Wazir!' : 'Wazir is guessing...') : 'Discussion Phase'}
          </Text>
          {malik && <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>👑 Malik: {malik.username}</Text>}
        </View>
        {myRole && (
          <View style={{ backgroundColor: ROLE_INFO[myRole]?.color + '33', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: ROLE_INFO[myRole]?.color }}>
              {ROLE_INFO[myRole]?.emoji} {ROLE_INFO[myRole]?.label}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Wazir guess UI */}
      {isGuessing && (
        <Animated.View
          entering={ZoomIn.duration(280)}
          style={{
            marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.bg.card,
            borderRadius: 16, padding: 14, gap: 12, borderWidth: 1,
            borderColor: Colors.purple + '55', overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.purple + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="git-compare" size={19} color={Colors.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Role assignment</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>
                {isWazir ? 'Pick a name, drop it into Harami or Shurta, then confirm.' : 'Watch Wazir place the suspects before confirming.'}
              </Text>
            </View>
            {countdown > 0 && (
              <View style={{
                minWidth: 54, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: countdown <= 10 ? 'rgba(239,68,68,0.18)' : Colors.purple + '22',
                borderWidth: 1, borderColor: countdown <= 10 ? Colors.red : Colors.purple + '66',
              }}>
                <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: countdown <= 10 ? Colors.red : Colors.purple }}>
                  {countdown}s
                </Text>
              </View>
            )}
          </View>

          <View style={{ gap: 8 }}>
            {malik && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#f59e0b18', borderWidth: 1, borderColor: '#f59e0b55' }}>
                <Text style={{ fontSize: 20 }}>{ROLE_INFO.malik.emoji}</Text>
                <Text style={{ width: 58, fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#f59e0b', textTransform: 'uppercase' }}>Malik</Text>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }} numberOfLines={1}>{malik.username}</Text>
              </View>
            )}
            {wazir && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: Colors.purple + '18', borderWidth: 1, borderColor: Colors.purple + '55' }}>
                <Text style={{ fontSize: 20 }}>{ROLE_INFO.wazir.emoji}</Text>
                <Text style={{ width: 58, fontSize: 11, fontFamily: 'Poppins_700Bold', color: Colors.purple, textTransform: 'uppercase' }}>Wazir</Text>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }} numberOfLines={1}>{wazir.username}</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.text.muted }}>choosing</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DropSpot
              title="Harami" color={Colors.red} icon="eye"
              player={selectedHaramiPlayer}
              active={isWazir && !!heldPlayerId} readOnly={!isWazir}
              onDrop={() => dropHeld('harami')} onClear={() => clearRole('harami')}
              onLayout={(layout) => setHaramiZone(layout)}
            />
            <DropSpot
              title="Shurta" color={Colors.blue} icon="shield-checkmark"
              player={selectedShurtaPlayer}
              active={isWazir && !!heldPlayerId} readOnly={!isWazir}
              onDrop={() => dropHeld('shurta')} onClear={() => clearRole('shurta')}
              onLayout={(layout) => setShurtaZone(layout)}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: Colors.text.muted, textTransform: 'uppercase' }}>
              {isWazir ? 'Drag players to assign roles' : 'Available suspects'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingVertical: 8 }}>
              {suspects.map((p) => {
                const previewRole = activeHaramiId === p.id ? 'harami' as const : activeShurtaId === p.id ? 'shurta' as const : undefined;
                return (
                  <DraggablePlayer
                    key={p.id} player={p} assignedRole={previewRole}
                    onDragStart={() => setHeldPlayerId(p.id)}
                    onDragEnd={(x, y) => checkDrop(x, y, p.id)}
                    disabled={!isWazir}
                  />
                );
              })}
            </View>
          </View>

          {isWazir ? (
            <Pressable
              onPress={onGuess}
              disabled={!selectedHarami || !selectedShurta || guessing}
              style={{
                backgroundColor: (!selectedHarami || !selectedShurta || guessing) ? Colors.bg.primary : Colors.purple,
                borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                borderWidth: 1, borderColor: (!selectedHarami || !selectedShurta || guessing) ? Colors.border : Colors.purple,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color={(!selectedHarami || !selectedShurta || guessing) ? Colors.text.muted : '#fff'} />
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: (!selectedHarami || !selectedShurta || guessing) ? Colors.text.muted : '#fff' }}>
                {guessing ? 'Submitting...' : selectedHarami && selectedShurta ? 'Confirm Assignments' : 'Drag both players first'}
              </Text>
            </Pressable>
          ) : (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: Colors.bg.primary, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.muted, textAlign: 'center' }}>
                Waiting for Wazir to confirm...
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const isBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 50;
          setIsAtChatBottom(isBottom);
        }}
        scrollEventThrottle={100}
      >
        {chatMsgs.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: m.color + '33', borderWidth: 1.5, borderColor: m.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: m.color }}>{m.username[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: m.color }}>{m.username}</Text>
                <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>
                  {new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{ backgroundColor: Colors.bg.card, borderRadius: 12, borderTopLeftRadius: 2, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.primary }}>{m.text}</Text>
              </View>
            </View>
          </View>
        ))}
        {typingUsers.length > 0 && (
          <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.text.muted, paddingLeft: 36 }}>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </Text>
        )}
      </ScrollView>

      {/* Scroll to bottom FAB */}
      {!isAtChatBottom && (
        <Animated.View
          entering={ZoomIn.springify()}
          style={{ position: 'absolute', bottom: 80, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.purple, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.purple, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
        >
          <Pressable onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            <Ionicons name="arrow-down" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

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
  const haramiCaught = round?.haramiCaught ?? false;
  const confetti = useSharedValue(0);

  useEffect(() => {
    playSound(haramiCaught ? 'correct' : 'wrong');
    if (haramiCaught) {
      confetti.value = withRepeat(withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ), 3, false);
    }
  }, [haramiCaught]);

  const confettiStyle = useAnimatedStyle(() => ({
    opacity: confetti.value,
    transform: [{ scale: interpolate(confetti.value, [0, 1], [0.8, 1.2]) }],
  }));

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {haramiCaught && (
        <Animated.View style={[{ position: 'absolute', top: 20, left: 0, right: 0, alignItems: 'center', zIndex: 10 }, confettiStyle]}>
          <Text style={{ fontSize: 80 }}>🎉</Text>
        </Animated.View>
      )}

      <Animated.View entering={FadeIn.duration(400)} style={{
        backgroundColor: haramiCaught ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
        borderRadius: 20, padding: 24, alignItems: 'center', gap: 8,
        borderWidth: 1, borderColor: haramiCaught ? Colors.blue : Colors.red, overflow: 'hidden',
      }}>
        <ResultScene haramiCaught={haramiCaught} />
        <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: haramiCaught ? Colors.blue : Colors.red }}>
          {haramiCaught ? 'HARAMI CAUGHT! +10' : 'Wrong suspect!'}
        </Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.text.secondary, textAlign: 'center' }}>
          {haramiCaught ? 'Red mask revealed. Police locked the round.' : 'Harami laughed and slipped away.'}
        </Text>
      </Animated.View>

      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1 }}>Roles Revealed</Text>
      <View style={{ backgroundColor: Colors.bg.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {[...state.players]
          .sort((a, b) => b.points - a.points)
          .map((p, i) => {
            const info = p.role ? ROLE_INFO[p.role] : null;
            const pts = round?.pointsAwarded?.[p.id] ?? 0;
            return (
              <Animated.View
                key={p.id}
                entering={SlideInUp.delay(i * 80).springify()}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.border }}
              >
                <Text style={{ fontSize: 22 }}>{info?.emoji ?? '❓'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>
                    {p.username} {p.id === myPlayerId ? '(You)' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: info?.color ?? Colors.text.muted }}>{info?.label ?? '?'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {pts > 0 && (
                    <Animated.Text entering={ZoomIn.delay(i * 80 + 200).springify()} style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.green }}>
                      +{pts}
                    </Animated.Text>
                  )}
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.text.secondary }}>{p.points} pts</Text>
                </View>
              </Animated.View>
            );
          })}
      </View>

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
  const sorted = [...state.players].sort((a, b) => b.points - a.points);
  const winner = sorted[0];
  const medals = ['🥇', '🥈', '🥉'];

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
