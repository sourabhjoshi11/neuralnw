import { Redirect, Tabs } from 'expo-router';
import { Pressable, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/store/authStore';
import { Colors, SpringConfig } from '@/constants/theme';
import { Haptics, shareText, copyToClipboard } from '@/utils/compat';

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  label: string;
};

function TabIcon({ name, focused, label }: TabIconProps) {
  const scale = useSharedValue(1);
  const indicatorOpacity = useSharedValue(focused ? 1 : 0);

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: indicatorOpacity.value }));

  // Bounce on focus
  if (focused) {
    scale.value = withSpring(1.15, SpringConfig.snappy, () => {
      scale.value = withSpring(1, SpringConfig.default);
    });
    indicatorOpacity.value = withSpring(1, SpringConfig.gentle);
  } else {
    indicatorOpacity.value = withSpring(0, SpringConfig.gentle);
  }

  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Animated.View style={scaleStyle}>
        <Ionicons name={name} size={22} color={focused ? Colors.blue : Colors.text.muted} />
      </Animated.View>
      <Text
        style={{
          fontSize: 10,
          fontFamily: 'Poppins_500Medium',
          color: focused ? Colors.blue : Colors.text.muted,
        }}
      >
        {label}
      </Text>
      <Animated.View
        style={[
          {
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: Colors.blue,
            marginTop: 1,
          },
          dotStyle,
        ]}
      />
    </View>
  );
}

export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/landing" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1a2235',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.05)',
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        tabBarButton: (props) => (
          <Pressable
            {...props}
            onPress={(e) => {
              Haptics.selection();
              props.onPress?.(e);
            }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" focused={focused} label="Home" />
          ),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="game-controller" focused={focused} label="Games" />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chatbubbles" focused={focused} label="Feed" />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="settings" focused={focused} label="Settings" />
          ),
        }}
      />
    </Tabs>
  );
}
