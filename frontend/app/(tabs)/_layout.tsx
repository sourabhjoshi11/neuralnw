import React, { useEffect, memo, useCallback } from "react";
import { router, Tabs } from "expo-router";

import { Pressable, View, Text, StyleSheet } from "react-native";

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/store/authStore";
import { Colors, SpringConfig } from "@/constants/theme";
import { Haptics } from "@/utils/compat";

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  label: string;
};

const TabIcon = memo(function TabIcon({ name, focused, label }: TabIconProps) {
  const scale = useSharedValue(1);

  const indicatorOpacity = useSharedValue(focused ? 1 : 0);

  // Run animations only when focus changes
  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.15, SpringConfig.snappy, () => {
        scale.value = withSpring(1, SpringConfig.default);
      });

      indicatorOpacity.value = withSpring(1, SpringConfig.gentle);
    } else {
      indicatorOpacity.value = withSpring(0, SpringConfig.gentle);
    }
  }, [focused]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: scale.value,
      },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.value,
  }));

  return (
    <View style={styles.tabContainer}>
      <Animated.View style={scaleStyle}>
        <Ionicons
          name={name}
          size={22}
          color={focused ? Colors.blue : Colors.text.muted}
        />
      </Animated.View>

      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: focused ? Colors.blue : Colors.text.muted,
          },
        ]}
      >
        {label}
      </Text>

      <Animated.View style={[styles.dot, dotStyle]} />
    </View>
  );
});

export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/(auth)/landing");
    }
  }, [isAuthenticated]);

  const renderTabBarButton = useCallback((props: any) => {
    const { ref: _ref, onPress, style, ...pressableProps } = props;

    return (
      <Pressable
        {...pressableProps}
        style={[style, styles.tabButton]}
        onPress={(e) => {
          Haptics.selection();
          onPress?.(e);
        }}
      />
    );
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarStyle: styles.tabBar,

        tabBarShowLabel: false,

        tabBarButton: renderTabBarButton,

        tabBarItemStyle: styles.tabItem,
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
            <TabIcon name="settings-outline" focused={focused} label="Set" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
  },

  tabItem: {
    flex: 1,
    minWidth: 0,
  },

  tabButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  label: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
    includeFontPadding: false,
  },

  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
    backgroundColor: Colors.blue,
  },

  tabBar: {
    backgroundColor: "#1a2235",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    height: 68,
    paddingBottom: 10,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
});
