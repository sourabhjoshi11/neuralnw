import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from "react-native-reanimated";

type Particle = {
  id: number;
  color: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rotation: number;
  delay: number;
};

function ConfettiParticle({ particle }: { particle: Particle }) {
  const translateX = useSharedValue(particle.startX);
  const translateY = useSharedValue(particle.startY);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    translateX.value = withDelay(
      particle.delay,
      withTiming(particle.endX, { duration: 1200, easing: Easing.out(Easing.quad) })
    );
    translateY.value = withDelay(
      particle.delay,
      withTiming(particle.endY, { duration: 1200, easing: Easing.in(Easing.quad) })
    );
    opacity.value = withDelay(
      particle.delay + 800,
      withTiming(0, { duration: 400 })
    );
    rotate.value = withDelay(
      particle.delay,
      withTiming(particle.rotation, { duration: 1200 })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    position: "absolute",
    width: 8,
    height: 8,
    backgroundColor: particle.color,
    borderRadius: 2,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return <Animated.View style={style} />;
}

type Props = {
  active: boolean;
  centerX: number;
  centerY: number;
  color: string;
};

export function ConfettiCelebration({ active, centerX, centerY, color }: Props) {
  if (!active) return null;

  const particles: Particle[] = Array.from({ length: 30 }, (_, i) => {
    const angle = (i / 30) * Math.PI * 2;
    const distance = 80 + Math.random() * 60;
    return {
      id: i,
      color: i % 3 === 0 ? color : i % 3 === 1 ? "#fbbf24" : "#f472b6",
      startX: 0,
      startY: 0,
      endX: Math.cos(angle) * distance,
      endY: Math.sin(angle) * distance,
      rotation: Math.random() * 720 - 360,
      delay: Math.random() * 100,
    };
  });

  return (
    <View
      style={{
        position: "absolute",
        left: centerX,
        top: centerY,
        width: 1,
        height: 1,
      }}
      pointerEvents="none"
    >
      {particles.map((p) => (
        <ConfettiParticle key={p.id} particle={p} />
      ))}
    </View>
  );
}

export function FlashOverlay({ active, color }: { active: boolean; color: string }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      opacity.value = withSequence(
        withTiming(0.6, { duration: 100 }),
        withTiming(0, { duration: 300 })
      );
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: color,
        },
        style,
      ]}
      pointerEvents="none"
    />
  );
}
