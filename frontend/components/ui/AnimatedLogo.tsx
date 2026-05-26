import { useEffect } from 'react';
import { View, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  interpolate,
} from 'react-native-reanimated';

type Props = { size?: number };

export function AnimatedLogo({ size = 200 }: Props) {
  const scale = useSharedValue(0.5);
  const pulse = useSharedValue(0);
  const ringRotate = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    // Entrance
    scale.value = withSpring(1, { damping: 10, stiffness: 80 });
    // Pulsing glow
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    // Subtle pulse on logo
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    // Ring rotation
    ringRotate.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value * interpolate(pulse.value, [0, 1], [1, 1.05]) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowOpacity.value, [0, 1], [0.2, 0.5]),
    transform: [{ scale: interpolate(glowOpacity.value, [0, 1], [0.9, 1.1]) }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotate.value}deg` }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Glow */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size * 0.85,
            height: size * 0.85,
            borderRadius: size * 0.425,
            backgroundColor: 'rgba(6,182,212,0.2)',
          },
          glowStyle,
        ]}
      />
      {/* Rotating outer ring */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: 'rgba(6,182,212,0.3)',
            borderStyle: 'dashed',
          },
          ringStyle,
        ]}
      />
      {/* Logo image */}
      <Animated.View style={logoStyle}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={{ width: size * 0.75, height: size * 0.75, borderRadius: size * 0.375 }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}
