import '../global.css';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { useEffect } from 'react';
import { Stack } from 'expo-router';

configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { useSession } from '@/hooks/useSession';
import { useAuthStore } from '@/store/authStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useSession(); // validates persisted token on start

  const isLoading = useAuthStore((s) => s.isLoading);

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const ready = (fontsLoaded || !!fontError) && !isLoading;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0a0e1a" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0e1a' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="game" />
        <Stack.Screen name="feed" />
      </Stack>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
