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
import { useSettingsStore } from '@/store/settingsStore';
import { applyTheme, Colors } from '@/constants/theme';
import * as SystemUI from 'expo-system-ui';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useSession(); // validates persisted token on start

  const isLoading = useAuthStore((s) => s.isLoading);
  const theme = useSettingsStore((s) => s.theme);
  applyTheme(theme);

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const ready = (fontsLoaded || !!fontError) && !isLoading;

  useEffect(() => {
    applyTheme(theme);
    SystemUI.setBackgroundColorAsync(Colors.bg.primary).catch(() => {});
  }, [theme]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} backgroundColor={Colors.bg.primary} />
      <Stack
        key={theme}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg.primary },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="game" />
        <Stack.Screen name="feed" />
        <Stack.Screen name="chor-sipahi" />
      </Stack>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
