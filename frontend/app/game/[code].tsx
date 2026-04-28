import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useGameStore } from '@/store/gameStore';

export default function GameRoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const phase = useGameStore((s) => s.phase);
  const room = useGameStore((s) => s.room);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ gap: 16, alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.blue} />
        <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>
          Room {code}
        </Text>
        <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
          Phase: {phase} — Game UI coming in Phase 5+
        </Text>
      </View>
    </SafeAreaView>
  );
}
