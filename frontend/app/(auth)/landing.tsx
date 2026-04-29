import { useEffect } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { AnimatedWheel } from '@/components/ui/AnimatedWheel';
import { Colors, SpringConfig } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

const FLOATING = [
  { emoji: '📚', x: 0.08 },
  { emoji: '✏️', x: 0.25 },
  { emoji: '💤', x: 0.45 },
  { emoji: '😂', x: 0.62 },
  { emoji: '🎯', x: 0.78 },
  { emoji: '📱', x: 0.91 },
];

const AVATAR_EMOJIS = ['🧑', '👩', '🧑', '👦'];

function FloatingEmoji({ emoji, x, delay }: { emoji: string; x: number; delay: number }) {
  const translateY = useSharedValue(height);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const loop = () => {
      translateY.value = height * 0.8 + Math.random() * height * 0.2;
      opacity.value = 0;

      setTimeout(() => {
        translateY.value = withTiming(-60, { duration: 7000 + Math.random() * 3000, easing: Easing.linear });
        opacity.value = withSequence(
          withTiming(0.7, { duration: 600 }),
          withDelay(5000, withTiming(0, { duration: 800 })),
        );
        setTimeout(loop, 9000 + Math.random() * 4000);
      }, delay);
    };
    loop();
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x * width,
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={style}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </Animated.View>
  );
}

function SocialProof() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {AVATAR_EMOJIS.map((emoji, i) => (
        <View
          key={i}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: '#1a2235',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: i > 0 ? -10 : 0,
            borderWidth: 2,
            borderColor: '#050810',
            zIndex: AVATAR_EMOJIS.length - i,
          }}
        >
          <Text style={{ fontSize: 14 }}>{emoji}</Text>
        </View>
      ))}
      <View
        style={{
          backgroundColor: 'rgba(59,130,246,0.15)',
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: 'rgba(59,130,246,0.3)',
          marginLeft: 4,
        }}
      >
        <Text style={{ color: Colors.blue, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
          2400+ playing
        </Text>
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0, { duration: 1500 }),
      ),
      -1,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      onPressIn={() => { scale.value = withSpring(0.95, SpringConfig.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
      style={{ width: '100%' }}
    >
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={['#3b82f6', '#06b6d4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: 16,
            borderRadius: 18,
            alignItems: 'center',
            shadowColor: '#3b82f6',
            shadowOpacity: 0.5,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
            {label}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export default function LandingScreen() {
  const wheelOpacity = useSharedValue(0);
  const wheelScale = useSharedValue(0.7);
  const titleY = useSharedValue(40);
  const titleOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const proofOpacity = useSharedValue(0);
  const buttonsY = useSharedValue(30);
  const buttonsOpacity = useSharedValue(0);

  useEffect(() => {
    // Staggered entrance sequence
    wheelOpacity.value = withSpring(1, SpringConfig.gentle);
    wheelScale.value = withSpring(1, SpringConfig.default);

    titleOpacity.value = withDelay(300, withSpring(1, SpringConfig.gentle));
    titleY.value = withDelay(300, withSpring(0, SpringConfig.default));

    taglineOpacity.value = withDelay(550, withSpring(1, SpringConfig.gentle));
    proofOpacity.value = withDelay(750, withSpring(1, SpringConfig.gentle));

    buttonsOpacity.value = withDelay(950, withSpring(1, SpringConfig.gentle));
    buttonsY.value = withDelay(950, withSpring(0, SpringConfig.default));
  }, []);

  const wheelStyle = useAnimatedStyle(() => ({
    opacity: wheelOpacity.value,
    transform: [{ scale: wheelScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));
  const proofStyle = useAnimatedStyle(() => ({ opacity: proofOpacity.value }));
  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsY.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#050810', alignItems: 'center' }}>
      {/* Floating classroom emojis */}
      {FLOATING.map((item, i) => (
        <FloatingEmoji key={i} emoji={item.emoji} x={item.x} delay={i * 1000} />
      ))}

      {/* Subtle radial glow behind wheel */}
      <View
        style={{
          position: 'absolute',
          top: height * 0.12,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: 'rgba(59,130,246,0.08)',
        }}
      />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 28 }}>
        {/* Wheel */}
        <Animated.View style={wheelStyle}>
          <AnimatedWheel size={220} duration={9000} />
        </Animated.View>

        {/* Wordmark */}
        <Animated.View style={[{ alignItems: 'center', gap: 10 }, titleStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ color: '#f1f5f9', fontSize: 46, fontFamily: 'Syne_900Black', letterSpacing: -1 }}>
              Class
            </Text>
            <Text style={{ fontSize: 46, fontFamily: 'Syne_900Black', color: '#3b82f6', letterSpacing: -1 }}>
              CHAOS
            </Text>
          </View>

          <Animated.View style={[{ alignItems: 'center', gap: 6 }, taglineStyle]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ height: 1, width: 36, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                Turn boring lectures into chaos
              </Text>
              <View style={{ height: 1, width: 36, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            </View>
          </Animated.View>
        </Animated.View>

        {/* Social proof */}
        <Animated.View style={proofStyle}>
          <SocialProof />
        </Animated.View>

        {/* CTA buttons */}
        <Animated.View style={[{ width: '100%', gap: 12 }, buttonsStyle]}>
          <PrimaryButton
            label="Get Started 🎲"
            onPress={() => router.push('/(auth)/phone')}
          />
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/(auth)/phone');
            }}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_500Medium' }}>
              Already have an account?{' '}
              <Text style={{ color: Colors.blue, fontFamily: 'Inter_600SemiBold' }}>Sign in</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
