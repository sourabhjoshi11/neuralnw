import { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const ANON_EMOJIS = ['🦊', '🐼', '🦁', '🐸', '🐯', '🦄', '🐙', '🦋'];

function GameCard({
  emoji,
  title,
  subtitle,
  badge,
  accentColor,
  delay,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  badge: string;
  accentColor: string;
  delay: number;
  onPress: () => void;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(delay, withSpring(1, SpringConfig.gentle));
    translateY.value = withDelay(delay, withSpring(0, SpringConfig.default));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97, SpringConfig.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
    >
      <Animated.View
        style={[
          {
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          },
          cardStyle,
        ]}
      >
        <LinearGradient
          colors={['#3b82f6', '#06b6d4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 2 }}
        />
        <View style={{ padding: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 36 }}>{emoji}</Text>
            <View
              style={{
                backgroundColor: `${accentColor}20`,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: `${accentColor}40`,
              }}
            >
              <Text style={{ color: accentColor, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
                {badge}
              </Text>
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>
              {title}
            </Text>
            <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              {subtitle}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const randomEmoji = ANON_EMOJIS[Math.floor(Math.random() * ANON_EMOJIS.length)];

  const greetOpacity = useSharedValue(0);
  useEffect(() => {
    greetOpacity.value = withSpring(1, SpringConfig.gentle);
  }, []);
  const greetStyle = useAnimatedStyle(() => ({ opacity: greetOpacity.value }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, greetStyle]}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              Welcome back 👋
            </Text>
            <Text style={{ color: Colors.text.primary, fontSize: 24, fontFamily: 'Syne_900Black' }}>
              Anonymous
            </Text>
          </View>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: Colors.bg.card,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: 'rgba(59,130,246,0.3)',
            }}
          >
            <Text style={{ fontSize: 24 }}>{randomEmoji}</Text>
          </View>
        </Animated.View>

        <View style={{ gap: 4 }}>
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 }}>
            Choose Your Game
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <GameCard
            emoji="🍾"
            title="Spin the Bottle"
            subtitle="Truth or Dare with your class — anonymous & chaotic"
            badge="MULTIPLAYER"
            accentColor={Colors.blue}
            delay={100}
            onPress={() => router.push('/game/create')}
          />
          <GameCard
            emoji="💬"
            title="Class Feed"
            subtitle="Anonymous confessions, gossip & reactions — 24h auto-delete"
            badge="SOCIAL"
            accentColor={Colors.cyan}
            delay={250}
            onPress={() => router.push('/feed/create')}
          />
        </View>

        <View style={{ gap: 12 }}>
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              { label: 'Join Game', emoji: '🎯', route: '/game/join' },
              { label: 'Join Feed', emoji: '📱', route: '/feed/join' },
            ].map(({ label, emoji, route }) => (
              <Pressable key={route} style={{ flex: 1 }} onPress={() => router.push(route as any)}>
                <View
                  style={{
                    backgroundColor: Colors.bg.card,
                    borderRadius: BorderRadius.card,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    padding: 16,
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                  <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                    {label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
