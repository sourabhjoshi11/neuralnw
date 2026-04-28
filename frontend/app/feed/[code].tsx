import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function FeedRoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ gap: 16, alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.cyan} />
        <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Syne_800ExtraBold' }}>
          Feed {code}
        </Text>
        <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
          Class Feed UI coming in Phase 12+
        </Text>
      </View>
    </SafeAreaView>
  );
}
