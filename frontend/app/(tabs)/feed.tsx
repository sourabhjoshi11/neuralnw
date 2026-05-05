import { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';

export default function FeedTabScreen() {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withSpring(1, SpringConfig.gentle);
    translateY.value = withSpring(0, SpringConfig.default);
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const card1Opacity = useSharedValue(0);
  const card1Y = useSharedValue(30);
  const card2Opacity = useSharedValue(0);
  const card2Y = useSharedValue(30);

  useEffect(() => {
    card1Opacity.value = withDelay(100, withSpring(1, SpringConfig.gentle));
    card1Y.value = withDelay(100, withSpring(0, SpringConfig.default));
    card2Opacity.value = withDelay(220, withSpring(1, SpringConfig.gentle));
    card2Y.value = withDelay(220, withSpring(0, SpringConfig.default));
  }, []);

  const card1Style = useAnimatedStyle(() => ({
    opacity: card1Opacity.value,
    transform: [{ translateY: card1Y.value }],
  }));
  const card2Style = useAnimatedStyle(() => ({
    opacity: card2Opacity.value,
    transform: [{ translateY: card2Y.value }],
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={headerStyle}>
          <Text style={{ color: Colors.text.primary, fontSize: 28, fontFamily: 'Syne_800ExtraBold', letterSpacing: -0.5 }}>
            Class Feed
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
            Anonymous group chats — all messages disappear in 24h
          </Text>
        </Animated.View>

        <Animated.View style={card1Style}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/feed/create');
            }}
          >
            <LinearGradient
              colors={['#06b6d4', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: BorderRadius.card,
                padding: 20,
                gap: 12,
                shadowColor: '#06b6d4',
                shadowOpacity: 0.35,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <Text style={{ fontSize: 36 }}>💬</Text>
              <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>Create a Feed</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                Start an anonymous group for your class — you'll be the admin
              </Text>
              <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, marginTop: 4 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Syne_800ExtraBold' }}>Create Feed →</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Animated.View style={card2Style}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/feed/join');
            }}
          >
            <View
              style={{
                backgroundColor: Colors.bg.card,
                borderRadius: BorderRadius.card,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
                padding: 20,
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 36 }}>📱</Text>
              <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>Join a Feed</Text>
              <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                Have an 8-character code? Join your classmate's anonymous group
              </Text>
              <View style={{ alignSelf: 'flex-start', backgroundColor: Colors.bg.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 4 }}>
                <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Enter Code →</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>

        <View
          style={{
            backgroundColor: 'rgba(6,182,212,0.06)',
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(6,182,212,0.15)',
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ color: Colors.cyan, fontSize: 14, fontFamily: 'Syne_800ExtraBold' }}>
            🔒 Privacy First
          </Text>
          {[
            '100% anonymous — no one knows who you are',
            'All messages auto-delete after 24 hours',
            'Screenshot protection enabled',
            'Content moderated to keep things safe',
          ].map((text) => (
            <View key={text} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Text style={{ color: Colors.cyan, fontSize: 12, marginTop: 2 }}>✓</Text>
              <Text style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
