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

import { Card, Badge, GradientButton } from '@/components/ui';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { Haptics, shareText, copyToClipboard } from '@/utils/compat';
import { useAuthStore } from '@/store/authStore';

const ANON_AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐯', '🦄', '🐙', '🦋', '🐧', '🦝'];

function useStaggeredEntrance(count: number, baseDelay = 80) {
  const values = Array.from({ length: count }, () => ({
    opacity: useSharedValue(0),
    translateY: useSharedValue(30),
  }));

  useEffect(() => {
    values.forEach((v, i) => {
      const delay = i * baseDelay;
      v.opacity.value = withDelay(delay, withSpring(1, SpringConfig.gentle));
      v.translateY.value = withDelay(delay, withSpring(0, SpringConfig.default));
    });
  }, []);

  return values.map((v) =>
    useAnimatedStyle(() => ({
      opacity: v.opacity.value,
      transform: [{ translateY: v.translateY.value }],
    }))
  );
}

type GameCardProps = {
  emoji: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  gradientColors: [string, string];
  animStyle: ReturnType<typeof useAnimatedStyle>;
  onPress: () => void;
  onPressSecondary?: { label: string; onPress: () => void };
};

function GameCard({
  emoji,
  title,
  subtitle,
  badge,
  badgeColor,
  gradientColors,
  animStyle,
  onPress,
  onPressSecondary,
}: GameCardProps) {
  const scale = useSharedValue(1);
  const cardPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={() => {
          Haptics.light();
          onPress();
        }}
        onPressIn={() => { scale.value = withSpring(0.97, SpringConfig.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
      >
        <Animated.View style={cardPressStyle}>
          <Card accentGradient={false} padding={0} style={{ overflow: 'hidden' }}>
            <LinearGradient
              colors={[`${gradientColors[0]}22`, `${gradientColors[1]}11`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 20, gap: 14 }}
            >
              {/* Top accent */}
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 2, position: 'absolute', top: 0, left: 0, right: 0 }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 38 }}>{emoji}</Text>
                <Badge label={badge} color={badgeColor} />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>
                  {title}
                </Text>
                <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19 }}>
                  {subtitle}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => {
                    Haptics.medium();
                    onPress();
                  }}
                >
                  <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      shadowColor: gradientColors[0],
                      shadowOpacity: 0.35,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 6,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Poppins_700Bold' }}>
                      Create
                    </Text>
                  </LinearGradient>
                </Pressable>
                {onPressSecondary && (
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                      Haptics.selection();
                      onPressSecondary.onPress();
                    }}
                  >
                    <View
                      style={{
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>
                        {onPressSecondary.label}
                      </Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </LinearGradient>
          </Card>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function StatPill({ emoji, label }: { emoji: string; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.bg.card,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
      <Text style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  // 0=header, 1=pills, 2=card1, 3=card2, 4=section title, 5=quick action row
  const anims = useStaggeredEntrance(6, 80);
  const randomAvatar = ANON_AVATARS[Math.floor(Math.random() * ANON_AVATARS.length)];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, anims[0]]}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
              Welcome back 👋
            </Text>
            <Text style={{ color: Colors.text.primary, fontSize: 26, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 }}>
              Anonymous
            </Text>
          </View>
          <Pressable
            onPress={() => Haptics.selection()}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: Colors.bg.card,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: 'rgba(59,130,246,0.3)',
              shadowColor: '#3b82f6',
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ fontSize: 24 }}>{randomAvatar}</Text>
          </Pressable>
        </Animated.View>

        {/* Stat pills */}
        <Animated.View style={[{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, anims[1]]}>
          <StatPill emoji="🎲" label="100% Anonymous" />
          <StatPill emoji="⚡" label="Real-time" />
          <StatPill emoji="💬" label="24h Auto-delete" />
        </Animated.View>

        {/* Section label */}
        <Animated.View style={anims[4]}>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 1.2 }}>
            Choose Your Game
          </Text>
        </Animated.View>

        {/* Game cards */}
        <GameCard
          emoji="🍾"
          title="Spin the Bottle"
          subtitle="Truth or Dare with your class — anonymous spins, wild reactions"
          badge="MULTIPLAYER"
          badgeColor={Colors.blue}
          gradientColors={['#3b82f6', '#06b6d4']}
          animStyle={anims[2]}
          onPress={() => router.push('/game/create')}
          onPressSecondary={{ label: 'Join', onPress: () => router.push('/game/join') }}
        />

        <GameCard
          emoji="💬"
          title="Class Feed"
          subtitle="Anonymous confessions, gossip & reactions — disappears in 24 hours"
          badge="SOCIAL"
          badgeColor={Colors.cyan}
          gradientColors={['#06b6d4', '#8b5cf6']}
          animStyle={anims[3]}
          onPress={() => router.push('/feed/create')}
          onPressSecondary={{ label: 'Join', onPress: () => router.push('/feed/join') }}
        />

        {/* Quick actions */}
        <Animated.View style={[{ gap: 10 }, anims[5]]}>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 1.2 }}>
            Quick Join
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              { emoji: '🎯', label: 'Join Game', route: '/game/join', color: Colors.blue },
              { emoji: '📱', label: 'Join Feed', route: '/feed/join', color: Colors.cyan },
            ].map(({ emoji, label, route, color }) => (
              <Pressable
                key={route}
                style={{ flex: 1 }}
                onPress={() => {
                  Haptics.light();
                  router.push(route as any);
                }}
              >
                <View
                  style={{
                    backgroundColor: Colors.bg.card,
                    borderRadius: BorderRadius.card,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    padding: 18,
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                  <Text style={{ color: color, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>
                    {label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
