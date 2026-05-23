import { Stack } from 'expo-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function GameLayout() {
  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0e1a' } }}>
        <Stack.Screen name="create" />
        <Stack.Screen name="join" />
        <Stack.Screen name="[code]" />
      </Stack>
    </ErrorBoundary>
  );
}
