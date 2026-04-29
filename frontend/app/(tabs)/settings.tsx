import { View, Text, Switch, Pressable, ScrollView, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

function SettingRow({
  icon,
  label,
  sublabel,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  right: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        gap: 14,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: 'rgba(59,130,246,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color={Colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
          {label}
        </Text>
        {sublabel && (
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
            {sublabel}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
  const { soundEnabled, vibrationEnabled, theme, setSoundEnabled, setVibrationEnabled, setTheme } =
    useSettingsStore();
  const { clearUser, token } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/auth/logout`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch {
            // ignore network errors on logout
          }
          clearUser();
          router.replace('/(auth)/landing');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: Colors.text.primary, fontSize: 28, fontFamily: 'Syne_900Black' }}>
          Settings
        </Text>

        <View style={{ gap: 4 }}>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Game Preferences
          </Text>
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.card,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              paddingHorizontal: 16,
            }}
          >
            <SettingRow
              icon="volume-medium"
              label="Sound Effects"
              sublabel="Game sounds and alerts"
              right={
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: '#374151', true: '#3b82f6' }}
                  thumbColor="#fff"
                />
              }
            />
            <SettingRow
              icon="phone-portrait"
              label="Vibration"
              sublabel="Haptic feedback"
              right={
                <Switch
                  value={vibrationEnabled}
                  onValueChange={setVibrationEnabled}
                  trackColor={{ false: '#374151', true: '#3b82f6' }}
                  thumbColor="#fff"
                />
              }
            />
            <SettingRow
              icon={theme === 'dark' ? 'moon' : 'sunny'}
              label="Dark Theme"
              sublabel="Currently active"
              right={
                <Switch
                  value={theme === 'dark'}
                  onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
                  trackColor={{ false: '#374151', true: '#3b82f6' }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Account
          </Text>
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.card,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              paddingHorizontal: 16,
            }}
          >
            <Pressable onPress={handleSignOut}>
              <SettingRow
                icon="log-out"
                label="Sign Out"
                right={<Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />}
              />
            </Pressable>
          </View>
        </View>

        <View
          style={{
            backgroundColor: 'rgba(59,130,246,0.08)',
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(59,130,246,0.2)',
            padding: 20,
            gap: 8,
          }}
        >
          <Text style={{ color: Colors.blue, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
            ⭐ Go Premium — ₹29/month
          </Text>
          <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
            • No pre-game ads{'\n'}• 4 free skips per game{'\n'}• Unlimited Class Feed messages
          </Text>
          <Pressable>
            <View
              style={{
                backgroundColor: Colors.blue,
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Syne_800ExtraBold' }}>
                Upgrade Now
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
