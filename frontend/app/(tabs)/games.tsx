import { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { Haptics } from '@/utils/compat';

type GameRoomCardProps = {
  emoji: string;
  title: string;
  subtitle: string;
  badge: string;
  gradient: [string, string];
  bullets: string[];
  createRoute: string;
  joinRoute: string;
  delay: number;
};

function GameRoomCard({
  emoji,
  title,
  subtitle,
  badge,
  gradient,
  bullets,
  createRoute,
  joinRoute,
  delay,
}: GameRoomCardProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(28);
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
    <Animated.View style={cardStyle}>
      <View
        style={{
          backgroundColor: Colors.bg.card,
          borderRadius: BorderRadius.card,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={[`${gradient[0]}26`, `${gradient[1]}12`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 18, gap: 16 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <LinearGradient
              colors={gradient}
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28 }}>{emoji}</Text>
            </LinearGradient>

            <View style={{ flex: 1, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>
                  {title}
                </Text>
                <View
                  style={{
                    backgroundColor: `${gradient[0]}22`,
                    borderRadius: 999,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderWidth: 1,
                    borderColor: `${gradient[0]}55`,
                  }}
                >
                  <Text style={{ color: gradient[0], fontSize: 10, fontFamily: 'Poppins_700Bold' }}>
                    {badge}
                  </Text>
                </View>
              </View>
              <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19 }}>
                {subtitle}
              </Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            {bullets.map((bullet) => (
              <View key={bullet} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: gradient[0] }} />
                <Text style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_400Regular', flex: 1 }}>
                  {bullet}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              style={{ flex: 1 }}
              onPressIn={() => { scale.value = withSpring(0.98, SpringConfig.snappy); }}
              onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
              onPress={() => {
                Haptics.medium();
                router.push(createRoute as any);
              }}
            >
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 44,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 7,
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Poppins_700Bold' }}>Create</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              style={{ flex: 1 }}
              onPressIn={() => { scale.value = withSpring(0.98, SpringConfig.snappy); }}
              onPressOut={() => { scale.value = withSpring(1, SpringConfig.default); }}
              onPress={() => {
                Haptics.selection();
                router.push(joinRoute as any);
              }}
            >
              <View
                style={{
                  height: 44,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 7,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <Ionicons name="enter-outline" size={17} color={Colors.text.secondary} />
                <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_700Bold' }}>Join</Text>
              </View>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

export default function GamesScreen() {
  const titleOpacity = useSharedValue(0);

  useEffect(() => {
    titleOpacity.value = withSpring(1, SpringConfig.gentle);
  }, []);

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 18 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={[{ gap: 4 }, titleStyle]}>
          <Text style={{ color: Colors.text.primary, fontSize: 28, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 }}>
            Game Rooms
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
            Pick a game, create a room, or jump in with a code.
          </Text>
        </Animated.View>

        <GameRoomCard
          emoji="🍾"
          title="Spin the Bottle"
          subtitle="Truth or Dare with anonymous turns, skips, reactions, and leaderboard chaos."
          badge="MULTIPLAYER"
          gradient={['#f59e0b', '#ec4899']}
          bullets={[
            'Random spin selects the next player',
            'Truth, dare, skips, and timed reactions',
            'Perfect for fast group rounds',
          ]}
          createRoute="/game/create"
          joinRoute="/game/join"
          delay={100}
        />

        <GameRoomCard
          emoji="👑"
          title="Harami vs Shurta"
          subtitle="A role game where Mantri hunts the Chor while hidden roles try to survive."
          badge="ROLEPLAY"
          gradient={['#7c3aed', '#ec4899']}
          bullets={[
            'Raja, Mantri, Sipahi, and Chor roles',
            'Guess the hidden players before time runs out',
            'Best with a crew that likes bluffing',
          ]}
          createRoute="/chor-sipahi/create"
          joinRoute="/chor-sipahi/join"
          delay={220}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
