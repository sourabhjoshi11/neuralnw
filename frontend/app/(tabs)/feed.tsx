import { View, Text, ScrollView, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius } from '@/constants/theme';

export default function FeedTabScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: Colors.text.primary, fontSize: 28, fontFamily: 'Syne_900Black' }}>
          Class Feed
        </Text>

        <Pressable onPress={() => router.push('/feed/create')}>
          <LinearGradient
            colors={['#06b6d4', '#8b5cf6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: BorderRadius.card,
              padding: 20,
              gap: 8,
              shadowColor: '#06b6d4',
              shadowOpacity: 0.4,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>
              Create a Feed
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              Anonymous group for your class — 24h auto-delete
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => router.push('/feed/join')}>
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.card,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              padding: 20,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 32 }}>📱</Text>
            <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>
              Join a Feed
            </Text>
            <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              Enter a feed code to join your class
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
