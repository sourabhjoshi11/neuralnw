import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, ZoomIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { Haptics, shareText } from '@/utils/compat';
import { DrawCanvas } from '@/components/scribble/Canvas';
import { analytics } from '@/utils/analytics';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://classchaos.onrender.com';

type Player = { id: string; username: string; score: number; user_id: string; is_connected: boolean };
type Stroke = { points: [number, number][]; color: string; width: number };
type Guess = { id: string; username: string; text: string; correct?: boolean; points?: number };

export default function ScribbleGameScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token, user } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);

  const [phase, setPhase] = useState<'lobby' | 'choosing' | 'drawing' | 'results' | 'finished'>('lobby');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [drawerId, setDrawerId] = useState('');
  const [drawerUsername, setDrawerUsername] = useState('');
  const [hint, setHint] = useState('');
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [guessText, setGuessText] = useState('');
  const [remoteStrokes, setRemoteStrokes] = useState<Stroke[]>([]);
  const [roundWord, setRoundWord] = useState('');
  const [roundScores, setRoundScores] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(5);
  const [isBlindRound, setIsBlindRound] = useState(false);
  const [isSaboteur, setIsSaboteur] = useState(false);
  const [saboteurId, setSaboteurId] = useState('');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [hasGuessed, setHasGuessed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isDrawer = myPlayerId === drawerId;

  // Fetch room and connect WS
  useEffect(() => {
    if (!token || !code) return;

    // Get room info
    fetch(`${API_URL}/scribble/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setPlayers(data.players || []);
        setIsHost(data.host_id === user?.id);
        const me = data.players?.find((p: Player) => p.user_id === user?.id);
        if (me) setMyPlayerId(me.id);
        if (data.phase !== 'lobby') setPhase(data.phase);
      })
      .catch(() => {});

    // Connect WebSocket
    const ws = new WebSocket(`${WS_URL}/ws/scribble/${code}?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    };

    ws.onclose = () => {};

    return () => { ws.close(); if (timerRef.current) clearInterval(timerRef.current); };
  }, [token, code]);

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'player_joined':
        setPlayers(prev => {
          if (prev.find(p => p.id === msg.player_id)) return prev;
          return [...prev, { id: msg.player_id, username: msg.username, score: 0, user_id: '', is_connected: true }];
        });
        break;
      case 'player_left':
        setPlayers(prev => prev.map(p => p.id === msg.player_id ? { ...p, is_connected: false } : p));
        break;
      case 'round_start':
        setPhase('choosing');
        setCurrentRound(msg.round);
        setTotalRounds(msg.total_rounds);
        setDrawerId(msg.drawer_id);
        setDrawerUsername(msg.drawer_username);
        setIsBlindRound(msg.is_blind_round);
        setRemoteStrokes([]);
        setGuesses([]);
        setHasGuessed(false);
        setIsSaboteur(false);
        setHint('');
        break;
      case 'word_choices':
        setWordChoices(msg.words);
        break;
      case 'you_are_saboteur':
        setIsSaboteur(true);
        Haptics.medium();
        break;
      case 'drawing_start':
        setPhase('drawing');
        setHint(msg.hint);
        setTimeLeft(msg.time_limit);
        startTimer(msg.time_limit);
        break;
      case 'draw':
        setRemoteStrokes(prev => [...prev, { points: msg.points, color: msg.color, width: msg.width }]);
        break;
      case 'clear':
        setRemoteStrokes([]);
        break;
      case 'hint_reveal':
        setHint(msg.hint);
        break;
      case 'guess':
        setGuesses(prev => [...prev, { id: msg.player_id, username: msg.username, text: msg.text }]);
        break;
      case 'correct_guess':
        setGuesses(prev => [...prev, { id: msg.player_id, username: msg.username, text: '✅ Correct!', correct: true, points: msg.points }]);
        if (msg.player_id === myPlayerId) { setHasGuessed(true); Haptics.success(); }
        break;
      case 'round_end':
        setPhase('results');
        setRoundWord(msg.word);
        setRoundScores(msg.scores);
        setSaboteurId(msg.saboteur_id || '');
        if (timerRef.current) clearInterval(timerRef.current);
        break;
      case 'game_end':
        setPhase('finished');
        setLeaderboard(msg.leaderboard);
        analytics.track('scribble_game_finished', { code });
        break;
      case 'saboteur_called':
        const result = msg.correct ? '✅ Caught!' : '❌ Wrong!';
        setGuesses(prev => [...prev, { id: msg.caller_id, username: result, text: `Called saboteur ${msg.correct ? 'correctly' : 'incorrectly'}!` }]);
        break;
      case 'error':
        Alert.alert('Error', msg.message);
        break;
    }
  }, [myPlayerId]);

  const startTimer = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let t = seconds;
    setTimeLeft(t);
    timerRef.current = setInterval(() => {
      t--;
      setTimeLeft(t);
      if (t <= 0 && timerRef.current) clearInterval(timerRef.current);
    }, 1000);
  };

  const send = (msg: any) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const handleStart = () => send({ type: 'start_game' });
  const handleChooseWord = (word: string) => { send({ type: 'choose_word', word }); setWordChoices([]); };
  const handleDraw = (points: [number, number][], color: string, width: number) => send({ type: 'draw', points, color, width });
  const handleClear = () => send({ type: 'clear' });
  const handleGuess = () => {
    if (!guessText.trim() || hasGuessed) return;
    send({ type: 'guess', text: guessText.trim() });
    setGuessText('');
  };
  const handleReact = (emoji: string) => send({ type: 'react', emoji });

  // ─── LOBBY ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </Pressable>
            <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>🎨 Doodle Chaos</Text>
          </View>

          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
            <Text style={{ fontSize: 48 }}>🎨</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>Waiting for players (min 3)</Text>
            <Pressable
              onPress={() => shareText(`Join my Doodle Chaos game! 🎨\n\nCode: ${code}\n\nOpen: classchaos://join/game/${code}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' }}>
              <Ionicons name="share-outline" size={16} color={Colors.cyan} />
              <Text style={{ color: Colors.cyan, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>Invite · {code}</Text>
            </Pressable>
          </View>

          <View style={{ backgroundColor: Colors.bg.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            {players.map((p, i) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ fontSize: 20 }}>🎨</Text>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{p.username}</Text>
                {p.id === myPlayerId && <Text style={{ fontSize: 11, color: Colors.cyan, fontFamily: 'Poppins_600SemiBold' }}>YOU</Text>}
              </View>
            ))}
          </View>

          {isHost && (
            <Pressable onPress={handleStart} disabled={players.length < 3}
              style={{ backgroundColor: Colors.cyan, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: players.length < 3 ? 0.5 : 1 }}>
              <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#000' }}>Start Game ({players.length} players)</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── WORD CHOICE (drawer only) ─────────────────────────────────────────────
  if (phase === 'choosing' && isDrawer && wordChoices.length > 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center', gap: 20 }}>
          <Text style={{ fontSize: 48 }}>✏️</Text>
          <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Pick a word to draw!</Text>
          {isBlindRound && <Text style={{ fontSize: 14, color: Colors.yellow, fontFamily: 'Poppins_600SemiBold' }}>🙈 BLIND ROUND — Canvas hides after 5s!</Text>}
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {wordChoices.map(w => (
              <Pressable key={w} onPress={() => handleChooseWord(w)}
                style={{ backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' }}>
                <Text style={{ color: Colors.cyan, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>{w}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ─── CHOOSING (non-drawer waiting) ─────────────────────────────────────────
  if (phase === 'choosing') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 48 }}>🤔</Text>
        <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', marginTop: 12 }}>{drawerUsername} is picking a word...</Text>
        {isSaboteur && (
          <Animated.View entering={FadeIn.delay(500)} style={{ marginTop: 16, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
            <Text style={{ color: '#ef4444', fontSize: 14, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>🕵️ You are the SABOTEUR!</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 4 }}>Mislead others with fake guesses!</Text>
          </Animated.View>
        )}
      </SafeAreaView>
    );
  }

  // ─── DRAWING PHASE ─────────────────────────────────────────────────────────
  if (phase === 'drawing') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 }}>
          <View>
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>Round {currentRound}/{totalRounds}</Text>
            <Text style={{ color: Colors.text.primary, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>
              {isDrawer ? '✏️ You are drawing' : `🎨 ${drawerUsername} is drawing`}
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: timeLeft <= 10 ? '#ef4444' : Colors.cyan, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>{timeLeft}s</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_600SemiBold', letterSpacing: 2 }}>{hint}</Text>
            {isBlindRound && <Text style={{ color: Colors.yellow, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>🙈 BLIND</Text>}
          </View>
        </View>

        {isSaboteur && !isDrawer && (
          <View style={{ marginHorizontal: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 8, marginBottom: 4 }}>
            <Text style={{ color: '#ef4444', fontSize: 11, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' }}>🕵️ SABOTEUR — Send misleading guesses!</Text>
          </View>
        )}

        {/* Canvas */}
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <DrawCanvas
            isDrawer={isDrawer}
            isBlind={isBlindRound}
            onDraw={handleDraw}
            onClear={handleClear}
            remoteStrokes={remoteStrokes}
          />
        </View>

        {/* Guesses */}
        <View style={{ maxHeight: 120, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          <ScrollView contentContainerStyle={{ padding: 8, gap: 4 }}>
            {guesses.slice(-10).map((g, i) => (
              <Text key={i} style={{ color: g.correct ? '#10b981' : Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>{g.username}: </Text>
                {g.text} {g.points ? `(+${g.points})` : ''}
              </Text>
            ))}
          </ScrollView>
        </View>

        {/* Guess input (non-drawer) */}
        {!isDrawer && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular' }}
              placeholder={hasGuessed ? "You guessed it! ✅" : "Type your guess..."}
              placeholderTextColor={Colors.text.muted}
              value={guessText}
              onChangeText={setGuessText}
              editable={!hasGuessed}
              returnKeyType="send"
              onSubmitEditing={handleGuess}
            />
            <Pressable onPress={handleGuess} disabled={hasGuessed}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: hasGuessed ? 'rgba(255,255,255,0.06)' : Colors.cyan, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="send" size={16} color={hasGuessed ? Colors.text.muted : '#000'} />
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ─── ROUND RESULTS ─────────────────────────────────────────────────────────
  if (phase === 'results') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, padding: 20 }}>
        <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center', gap: 16, flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>The word was:</Text>
          <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', color: Colors.cyan }}>{roundWord}</Text>

          {saboteurId && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
              <Text style={{ color: '#ef4444', fontSize: 13, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' }}>
                🕵️ Saboteur: {roundScores.find((s: any) => s.id === saboteurId)?.username ?? '?'}
              </Text>
            </View>
          )}

          <View style={{ width: '100%', gap: 8, marginTop: 12 }}>
            {roundScores.map((s: any, i: number) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.card, borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.text.muted, width: 24 }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{s.username}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.cyan }}>{s.score}</Text>
                {s.round_points > 0 && <Text style={{ fontSize: 11, color: '#10b981', fontFamily: 'Poppins_600SemiBold' }}>+{s.round_points}</Text>}
              </View>
            ))}
          </View>

          {/* Roast reactions */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {['🔥', '💀', '😂', '🎨', '🤡', '👏'].map(emoji => (
              <Pressable key={emoji} onPress={() => handleReact(emoji)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 8 }}>Next round starting...</Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ─── GAME FINISHED ─────────────────────────────────────────────────────────
  if (phase === 'finished') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, padding: 20 }}>
        <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 20, paddingVertical: 20 }}>
          <Text style={{ fontSize: 48 }}>🏆</Text>
          <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: Colors.text.primary }}>Game Over!</Text>

          {leaderboard.map((p: any, i: number) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(i * 100)} style={{ width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: i === 0 ? 'rgba(6,182,212,0.12)' : Colors.bg.card, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: i === 0 ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)' }}>
              <Text style={{ fontSize: 24 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</Text>
              <Text style={{ flex: 1, fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.text.primary }}>{p.username}</Text>
              <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.cyan }}>{p.score}</Text>
            </Animated.View>
          ))}

          <Pressable onPress={() => router.back()}
            style={{ backgroundColor: Colors.cyan, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 12 }}>
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#000' }}>Back to Games</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}
