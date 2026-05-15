import { useEffect, useRef, useCallback } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import Svg, { Path, Circle, Text as SvgText, Defs, RadialGradient, Stop, G } from 'react-native-svg';
import type { AnonPlayer } from '@/types';

type Props = {
  players: AnonPlayer[];
  targetPlayerId: string | null;
  spinning: boolean;
  size?: number;
  onSpinComplete?: () => void;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

// Darken a hex color for inner edge effect
function darkenColor(hex: string, amount = 0.3): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
  const b = Math.max(0, (num & 0xff) * (1 - amount));
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function SpinWheel({ players, targetPlayerId, spinning, size = 290, onSpinComplete }: Props) {
  const rotation = useSharedValue(0);
  const glowScale = useSharedValue(1);
  const pointerY = useSharedValue(0);
  const isAnimating = useRef(false);

  // Sound refs
  const tickSoundRef = useRef<Audio.Sound | null>(null);
  const tickTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowScale.value > 1 ? 0.6 : 0,
  }));

  const pointerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pointerY.value }],
  }));

  // Load tick sound once
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    Audio.Sound.createAsync(
      require('../../assets/sounds/tick.wav'),
      { volume: 0.7 },
    ).then(({ sound }) => {
      tickSoundRef.current = sound;
    }).catch(() => {});
    return () => {
      tickSoundRef.current?.unloadAsync();
    };
  }, []);

  // JS-thread callback to safely reset isAnimating
  const onAnimDone = useCallback(() => {
    isAnimating.current = false;
    pointerY.value = withSequence(
      withTiming(8, { duration: 80 }),
      withSpring(0, { damping: 4, stiffness: 300, mass: 0.6 }),
    );
    onSpinComplete?.();
  }, [onSpinComplete]);

  // Play tick sound — called from JS timers during spin
  const playTick = useCallback(() => {
    if (!tickSoundRef.current) return;
    tickSoundRef.current.setPositionAsync(0)
      .then(() => tickSoundRef.current?.playAsync())
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Clear any previous tick timers
    tickTimers.current.forEach(clearTimeout);
    tickTimers.current = [];

    if (!spinning || !targetPlayerId || players.length === 0 || isAnimating.current) return;

    const targetIndex = players.findIndex((p) => p.id === targetPlayerId);
    if (targetIndex < 0) return;

    isAnimating.current = true;

    // Pulse glow when spin starts
    glowScale.value = withSequence(
      withTiming(1.08, { duration: 300 }),
      withTiming(1, { duration: 300 }),
      withTiming(1.06, { duration: 300 }),
      withTiming(1, { duration: 300 }),
    );

    const sliceAngle = 360 / players.length;
    const sliceCenter = targetIndex * sliceAngle + sliceAngle / 2;
    const currentMod = ((rotation.value % 360) + 360) % 360;
    const targetOffset = (360 - sliceCenter) % 360;
    let delta = (targetOffset - currentMod + 360) % 360;
    if (delta < 15) delta += 360;

    const startAngle = rotation.value;
    const spinUpAngle = 2 * 360;
    const totalAngle = 6 * 360 + delta;
    const midAngle = startAngle + spinUpAngle;
    const endAngle = startAngle + totalAngle;

    // Schedule tick sounds + haptics: ease-in then ease-out intervals
    const TOTAL_MS = 4600;
    const START_INTERVAL = 55;
    const END_INTERVAL = 400;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    let interval = START_INTERVAL;
    while (elapsed < TOTAL_MS - 200) {
      const t = elapsed;
      timers.push(setTimeout(() => { playTick(); }, t));
      interval = Math.min(interval * 1.12, END_INTERVAL);
      elapsed += interval;
    }
    tickTimers.current = timers;

    rotation.value = withSequence(
      withTiming(midAngle, {
        duration: 1000,
        easing: Easing.in(Easing.cubic),
      }),
      withTiming(endAngle, {
        duration: 3600,
        easing: Easing.out(Easing.cubic),
      }, () => {
        'worklet';
        runOnJS(onAnimDone)();
      }),
    );
  }, [spinning, targetPlayerId]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const n = Math.max(players.length, 1);
  const sliceAngle = 360 / n;
  const showLabels = sliceAngle >= 20;

  const winnerColor = targetPlayerId
    ? (players.find((p) => p.id === targetPlayerId)?.color ?? '#3b82f6')
    : '#3b82f6';

  return (
    <View style={{ alignItems: 'center', gap: 0 }}>
      {/* Pointer */}
      <Animated.View style={[{ zIndex: 20, marginBottom: -2 }, pointerStyle]}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 11,
            borderRightWidth: 11,
            borderTopWidth: 18,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: spinning ? winnerColor : '#f1f5f9',
            shadowColor: spinning ? winnerColor : '#fff',
            shadowOpacity: spinning ? 0.9 : 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      </Animated.View>

      {/* Outer glow ring (animates when spinning) */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 16,
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            backgroundColor: winnerColor,
          },
          glowStyle,
        ]}
      />

      <View style={{ width: size, height: size }}>
        {/* Outer decorative ring */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 3,
            borderColor: spinning ? winnerColor + '88' : 'rgba(255,255,255,0.12)',
          }}
        />

        {/* Rotating wheel */}
        <Animated.View style={[{ width: size, height: size }, wheelStyle]}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#1e293b" />
                <Stop offset="100%" stopColor="#0a0e1a" />
              </RadialGradient>
            </Defs>

            {/* Slices */}
            {players.map((player, i) => {
              const startDeg = i * sliceAngle;
              const endDeg = (i + 1) * sliceAngle;
              const midDeg = startDeg + sliceAngle / 2;
              const isWinner = player.id === targetPlayerId && !spinning;

              return (
                <G key={player.id}>
                  <Path
                    d={slicePath(cx, cy, r, startDeg, endDeg)}
                    fill={player.color}
                    opacity={isWinner ? 1 : 0.88}
                  />
                  {/* Inner darker edge for depth */}
                  <Path
                    d={slicePath(cx, cy, r * 0.38, startDeg, endDeg)}
                    fill={darkenColor(player.color, 0.35)}
                    opacity={0.6}
                  />
                </G>
              );
            })}

            {/* Divider lines */}
            {players.map((_, i) => {
              const pt = polarToCartesian(cx, cy, r, i * sliceAngle);
              return (
                <Path
                  key={`d-${i}`}
                  d={`M ${cx} ${cy} L ${pt.x} ${pt.y}`}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={2}
                />
              );
            })}

            {/* Player labels */}
            {showLabels &&
              players.map((player, i) => {
                const midDeg = i * sliceAngle + sliceAngle / 2;
                // ≤6 players (sliceAngle ≥ 60°): show short name, else just initial
                const label =
                  sliceAngle >= 60
                    ? player.username.slice(0, 7).toUpperCase()
                    : player.username[0]?.toUpperCase() ?? '?';
                const fontSize = sliceAngle > 60 ? 13 : sliceAngle > 35 ? 12 : 11;
                // Push label outward a bit more when showing full name so it's not cramped
                const labelR = sliceAngle >= 60 ? r * 0.62 : r * 0.65;
                const { x, y } = polarToCartesian(cx, cy, labelR, midDeg);
                return (
                  <SvgText
                    key={`t-${player.id}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={fontSize}
                    fill="rgba(255,255,255,0.95)"
                    fontWeight="bold"
                    transform={`rotate(${midDeg}, ${x}, ${y})`}
                  >
                    {label}
                  </SvgText>
                );
              })}

            {/* Hub outer ring */}
            <Circle cx={cx} cy={cy} r={34} fill="#0a0e1a" />
            <Circle cx={cx} cy={cy} r={30} fill="url(#hubGrad)" />
            <Circle
              cx={cx}
              cy={cy}
              r={30}
              fill="none"
              stroke={spinning ? winnerColor : 'rgba(255,255,255,0.15)'}
              strokeWidth={1.5}
            />
            {/* Center dot */}
            <Circle cx={cx} cy={cy} r={5} fill={spinning ? winnerColor : '#475569'} />
          </Svg>
        </Animated.View>

        {/* Bottle emoji fixed at center */}
        <View
          style={{
            position: 'absolute',
            top: cy - 14,
            left: cx - 14,
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <Text style={{ fontSize: 18 }}>🍾</Text>
        </View>
      </View>
    </View>
  );
}
