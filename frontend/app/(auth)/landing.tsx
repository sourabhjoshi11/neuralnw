import { useEffect } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, SpringConfig } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

const FLOATING_EMOJIS = ['📚', '✏️', '💤', '😂', '🎯', '📱'];

function FloatingEmoji({ emoji, delay, x }: { emoji: string; delay: number; x: number }) {
  const translateY = useSharedValue(height * 0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const start = () => {
      translateY.value = height * 0.9;
      opacity.value = 0;
      setTimeout(() => {
        translateY.value = withTiming(-80, { duration: 8000, easing: Easing.linear });
        opacity.value = withTiming(1, { duration: 500 }, () => {
          opacity.value = withTiming(0, { duration: 500, easing: Easing.in(Easing.ease) });
        });
        setTimeout(start, 8000 + Math.random() * 4000);
      }, delay);
    };
    start();
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
    position: 'absolute',
    left: x,
    fontSize: 24,
  }));

  return <Animated.Text style={animStyle}>{emoji}</Animated.Text>;
}

function AnimatedWheel() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const SLICE_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
  const SIZE = 200;
  const CENTER = SIZE / 2;
  const RADIUS = SIZE / 2 - 4;

  return (
    <Animated.View style={[{ width: SIZE, height: SIZE }, wheelStyle]}>
      <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', position: 'relative' }}>
        {SLICE_COLORS.map((color, i) => {
          const angle = (360 / 6) * i;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: SIZE / 2,
                overflow: 'hidden',
                transform: [{ rotate: `${angle}deg` }],
              }}
            >
              <View
                style={{
                  width: '50%',
                  height: '100%',
                  backgroundColor: color,
                  transformOrigin: 'right center',
                  transform: [{ rotate: '30deg' }],
                  position: 'absolute',
                  right: 0,
                }}
              />
            </View>
          );
        })}
        <View
          style={{
            position: 'absolute',
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: '#0a0e1a',
            top: CENTER - 24,
            left: CENTER - 24,
            zIndex: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 24 }}>🍾</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, SpringConfig.snappy);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, SpringConfig.default);
  };

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={['#3b82f6', '#06b6d4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: 16,
            paddingHorizontal: 48,
            borderRadius: 18,
            shadowColor: '#3b82f6',
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 16,
              fontFamily: 'Syne_800ExtraBold',
              textAlign: 'center',
            }}
          >
            {label}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export default function LandingScreen() {
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(30);
  const taglineOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    setTimeout(() => {
      titleOpacity.value = withSpring(1, SpringConfig.gentle);
      titleY.value = withSpring(0, SpringConfig.default);
    }, 300);
    setTimeout(() => {
      taglineOpacity.value = withSpring(1, SpringConfig.gentle);
    }, 700);
    setTimeout(() => {
      buttonOpacity.value = withSpring(1, SpringConfig.gentle);
    }, 1000);
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }));

  return (
    <View style={{ flex: 1, backgroundColor: '#050810', alignItems: 'center' }}>
      {FLOATING_EMOJIS.map((emoji, i) => (
        <FloatingEmoji
          key={i}
          emoji={emoji}
          delay={i * 1200}
          x={40 + (i * (width - 80)) / (FLOATING_EMOJIS.length - 1)}
        />
      ))}

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        <AnimatedWheel />

        <Animated.View style={[{ alignItems: 'center', gap: 8 }, titleStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#f1f5f9', fontSize: 48, fontFamily: 'Syne_900Black' }}>
              Class
            </Text>
            <Text
              style={{
                fontSize: 48,
                fontFamily: 'Syne_900Black',
                color: '#3b82f6',
              }}
            >
              CHAOS
            </Text>
          </View>
          <Animated.View style={taglineStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ height: 1, width: 40, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              <Text
                style={{
                  color: '#94a3b8',
                  fontSize: 14,
                  fontFamily: 'Inter_400Regular',
                  textAlign: 'center',
                }}
              >
                Turn boring lectures into chaos
              </Text>
              <View style={{ height: 1, width: 40, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>
          </Animated.View>
        </Animated.View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {['🧑', '👩', '🧑', '👦'].map((emoji, i) => (
            <View
              key={i}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#1a2235',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: i > 0 ? -10 : 0,
                borderWidth: 2,
                borderColor: '#050810',
              }}
            >
              <Text style={{ fontSize: 16 }}>{emoji}</Text>
            </View>
          ))}
          <Text style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'Inter_500Medium', marginLeft: 8 }}>
            2400+ playing
          </Text>
        </View>

        <Animated.View style={[{ width: '80%', gap: 12, alignItems: 'center' }, buttonStyle]}>
          <PrimaryButton label="Get Started 🎲" onPress={() => router.push('/(auth)/phone')} />
          <Pressable onPress={() => router.push('/(auth)/phone')}>
            <Text
              style={{
                color: '#94a3b8',
                fontSize: 14,
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              Already have an account? Sign in
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
