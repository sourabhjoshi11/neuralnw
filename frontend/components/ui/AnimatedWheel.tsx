import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useDerivedValue,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { WheelColors } from '@/constants/theme';

type Props = {
  size?: number;
  /** Rotation duration in ms — slower = more decorative, faster = spinning effect */
  duration?: number;
  labels?: string[];
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
}

export function AnimatedWheel({ size = 220, duration = 8000, labels = [] }: Props) {
  const rotation = useSharedValue(0);
  const bottleAngle = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration, easing: Easing.linear }),
      -1,
      false,
    );
    bottleAngle.value = withRepeat(
      withTiming(360, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // Bottle orbits on the wheel rim
  const ORBIT_R = size / 2 - 16;
  const bottleStyle = useAnimatedStyle(() => {
    const rad = ((bottleAngle.value - 90) * Math.PI) / 180;
    const x = size / 2 + ORBIT_R * Math.cos(rad) - 12;
    const y = size / 2 + ORBIT_R * Math.sin(rad) - 12;
    return { position: 'absolute', left: x, top: y };
  });

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const sliceAngle = 360 / WheelColors.length;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, wheelStyle]}>
        <Svg width={size} height={size}>
          {WheelColors.map((color, i) => (
            <Path
              key={i}
              d={slicePath(cx, cy, r, i * sliceAngle, (i + 1) * sliceAngle)}
              fill={color}
            />
          ))}
          {/* Separator lines */}
          {WheelColors.map((_, i) => {
            const pt = polarToCartesian(cx, cy, r, i * sliceAngle);
            return (
              <Path
                key={`line-${i}`}
                d={`M ${cx} ${cy} L ${pt.x} ${pt.y}`}
                stroke="rgba(10,14,26,0.6)"
                strokeWidth={2}
              />
            );
          })}
          {/* Center hub */}
          <Circle cx={cx} cy={cy} r={28} fill="#0a0e1a" />
          <Circle cx={cx} cy={cy} r={24} fill="#111827" />
        </Svg>
      </Animated.View>

      {/* Orbiting bottle */}
      <Animated.View style={bottleStyle}>
        <Text style={{ fontSize: 22 }}>🍾</Text>
      </Animated.View>
    </View>
  );
}
