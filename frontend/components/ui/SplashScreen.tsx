import { View, Text } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ClassChaosLogo, ClassChaosWordmark } from "@/components/ui/ClassChaosLogo";
import { Colors } from "@/constants/theme";

export function SplashScreen() {
  return (
    <LinearGradient
      colors={["#0a0e1a", "#1a1f35", "#0a0e1a"]}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {/* Logo */}
      <Animated.View entering={ZoomIn.springify().delay(200)}>
        <ClassChaosLogo size={140} />
      </Animated.View>

      {/* App Name */}
      <Animated.View entering={FadeIn.delay(400)}>
        <Text
          style={{
            color: Colors.text.primary,
            fontSize: 36,
            fontFamily: "Poppins_700Bold",
            letterSpacing: 2,
          }}
        >
          ClassChaos
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View entering={FadeIn.delay(600)}>
        <Text
          style={{
            color: Colors.text.muted,
            fontSize: 14,
            fontFamily: "Poppins_400Regular",
            letterSpacing: 1,
          }}
        >
          Anonymous Games & Feeds
        </Text>
      </Animated.View>

      {/* Loading indicator */}
      <Animated.View entering={FadeIn.delay(800)}>
        <View
          style={{
            width: 40,
            height: 4,
            backgroundColor: "rgba(59,130,246,0.2)",
            borderRadius: 2,
            overflow: "hidden",
            marginTop: 20,
          }}
        >
          <Animated.View
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: Colors.cyan,
            }}
          />
        </View>
      </Animated.View>
    </LinearGradient>
  );
}
