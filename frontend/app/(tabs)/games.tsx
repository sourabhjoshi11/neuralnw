import { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { Haptics, shareText, copyToClipboard } from '@/utils/compat';

type ActionCardProps = {
  emoji: string;
  title: string;
  subtitle: string;
  cta: string;
  gradient?: [string, string];
  onPress: () => void;
  delay: number;
};

function ActionCard({ emoji, title, subtitle, cta, gradient, onPress, delay }: ActionCardProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);
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
      onPress={() => {
        Haptics.light();
        onPress();
      }}
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
        {gradient ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 20, gap: 12 }}
          >
            <Text style={{ fontSize: 36 }}>{emoji}</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Poppins_700Bold' }}>{title}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Poppins_400Regular' }}>{subtitle}</Text>
            <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, marginTop: 4 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Poppins_700Bold' }}>{cta}</Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={{ padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 36 }}>{emoji}</Text>
            <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>{title}</Text>
            <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>{subtitle}</Text>
            <View style={{ alignSelf: 'flex-start', backgroundColor: Colors.bg.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 4 }}>
              <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>{cta}</Text>
            </View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

export default function GamesScreen() {
  const titleOpacity = useSharedValue(0);
  useEffect(() => { titleOpacity.value = withSpring(1, SpringConfig.gentle); }, []);
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={titleStyle}>
          <Text style={{ color: Colors.text.primary, fontSize: 28, fontFamily: 'Poppins_700Bold', letterSpacing: -0.5 }}>
            Game Rooms
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>
            Create or join a Spin the Bottle room
          </Text>
        </Animated.View>

        <ActionCard
          emoji="🍾"
          title="Create New Room"
          subtitle="Start a game and share the 6-digit code with your class"
          cta="Create Room →"
          gradient={['#3b82f6', '#06b6d4']}
          onPress={() => router.push('/game/create')}
          delay={100}
        />
        <ActionCard
          emoji="🎯"
          title="Join a Room"
          subtitle="Have a code? Jump straight into someone else's game"
          cta="Enter Code →"
          onPress={() => router.push('/game/join')}
          delay={220}
        />

        <View style={{ marginTop: 8, padding: 16, backgroundColor: Colors.bg.card, borderRadius: BorderRadius.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 10 }}>
          <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_700Bold' }}>How to play</Text>
          {[
            ['🍾', 'Spin selects a random anonymous player'],
            ['🎯', 'Truth (+10pts) or Dare (+20pts)'],
            ['😂', '1 min reaction time for the whole class'],
            ['💀', 'Skip? Blackout! 3 skips = group vote'],
            ['🏆', 'Last place gets their identity revealed'],
          ].map(([emoji, text]) => (
            <View key={text as string} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 16, marginTop: 1 }}>{emoji}</Text>
              <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_400Regular', flex: 1 }}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
