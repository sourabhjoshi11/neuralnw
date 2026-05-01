import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Text as SvgText, Polygon } from 'react-native-svg';
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

export function SpinWheel({ players, targetPlayerId, spinning, size = 280, onSpinComplete }: Props) {
  const rotation = useSharedValue(0);
  const isAnimating = useRef(false);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (!spinning || !targetPlayerId || players.length === 0 || isAnimating.current) return;

    const targetIndex = players.findIndex((p) => p.id === targetPlayerId);
    if (targetIndex < 0) return;

    isAnimating.current = true;
    const sliceAngle = 360 / players.length;
    const sliceCenter = targetIndex * sliceAngle + sliceAngle / 2;

    // Rotate so sliceCenter lands under the top pointer (0° = 12 o'clock)
    const currentMod = ((rotation.value % 360) + 360) % 360;
    const targetOffset = (360 - sliceCenter) % 360;
    let delta = (targetOffset - currentMod + 360) % 360;
    if (delta < 10) delta += 360; // guarantee visible movement

    const finalAngle = rotation.value + 5 * 360 + delta;

    rotation.value = withTiming(
      finalAngle,
      { duration: 3400, easing: Easing.out(Easing.cubic) },
      () => {
        'worklet';
        isAnimating.current = false;
        if (onSpinComplete) runOnJS(onSpinComplete)();
      }
    );
  }, [spinning, targetPlayerId]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const n = Math.max(players.length, 1);
  const sliceAngle = 360 / n;
  const showLabels = sliceAngle >= 22; // hide text when slices too thin

  return (
    <View style={{ width: size, height: size + 16, alignItems: 'center' }}>
      {/* Pointer triangle at top */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 9,
          borderRightWidth: 9,
          borderTopWidth: 14,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: '#f1f5f9',
          zIndex: 10,
          marginBottom: 2,
        }}
      />

      <View style={{ width: size, height: size }}>
        {/* Rotating wheel */}
        <Animated.View style={[{ width: size, height: size }, wheelStyle]}>
          <Svg width={size} height={size}>
            {players.map((player, i) => {
              const startDeg = i * sliceAngle;
              const endDeg = (i + 1) * sliceAngle;
              const midDeg = startDeg + sliceAngle / 2;
              const labelPos = polarToCartesian(cx, cy, r * 0.63, midDeg);

              return (
                <Path
                  key={player.id}
                  d={slicePath(cx, cy, r, startDeg, endDeg)}
                  fill={player.color}
                />
              );
            })}

            {/* Divider lines */}
            {players.map((_, i) => {
              const pt = polarToCartesian(cx, cy, r, i * sliceAngle);
              return (
                <Path
                  key={`d-${i}`}
                  d={`M ${cx} ${cy} L ${pt.x} ${pt.y}`}
                  stroke="rgba(10,14,26,0.5)"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Player initials */}
            {showLabels &&
              players.map((player, i) => {
                const midDeg = i * sliceAngle + sliceAngle / 2;
                const { x, y } = polarToCartesian(cx, cy, r * 0.63, midDeg);
                const fontSize = sliceAngle > 60 ? 18 : sliceAngle > 35 ? 14 : 11;
                return (
                  <SvgText
                    key={`t-${player.id}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={fontSize}
                    fill="rgba(255,255,255,0.92)"
                    fontWeight="bold"
                    transform={`rotate(${midDeg}, ${x}, ${y})`}
                  >
                    {player.username[0]?.toUpperCase() ?? '?'}
                  </SvgText>
                );
              })}

            {/* Hub */}
            <Circle cx={cx} cy={cy} r={30} fill="#0a0e1a" />
            <Circle cx={cx} cy={cy} r={26} fill="#111827" />
            <Circle cx={cx} cy={cy} r={4} fill="#3b82f6" />
          </Svg>
        </Animated.View>

        {/* Fixed bottle at center */}
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
        </View>
      </View>
    </View>
  );
}
