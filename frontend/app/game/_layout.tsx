import { Stack } from 'expo-router';

export default function GameLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0e1a' } }}>
      <Stack.Screen name="create" />
      <Stack.Screen name="join" />
      <Stack.Screen name="[code]" />
    </Stack>
  );
}
