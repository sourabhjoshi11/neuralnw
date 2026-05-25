import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

function SparkParticle({ index, radius }: { index: number; radius: number }) {
  const angle = (index / 8) * Math.PI * 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      index * 50,
      withRepeat(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      index * 50,
      withRepeat(
        withTiming(0.8, { duration: 300 }),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    position: "absolute",
    left: x,
    top: y,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#fbbf24",
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={style} />;
}

type Props = {
  active: boolean;
  size: number;
};

export function SpinParticles({ active, size }: Props) {
  if (!active) return null;

  const radius = size / 2 + 15;

  return (
    <View
      style={{
        position: "absolute",
        left: size / 2,
        top: size / 2,
        width: 1,
        height: 1,
      }}
      pointerEvents="none"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <SparkParticle key={i} index={i} radius={radius} />
      ))}
    </View>
  );
}
