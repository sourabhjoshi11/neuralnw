import { useEffect, useState } from 'react';
import { View, Text, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

const AD_DURATION = 5;

export function AdGate({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const [countdown, setCountdown] = useState(AD_DURATION);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      setCountdown(AD_DURATION);
      progress.value = 0;
      return;
    }

    progress.value = withTiming(1, { duration: AD_DURATION * 1000, easing: Easing.linear });

    // Separate timer for dismiss — never call side-effects inside a setState updater
    const dismissTimer = setTimeout(onDismiss, AD_DURATION * 1000);

    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    return () => {
      clearTimeout(dismissTimer);
      clearInterval(interval);
    };
  }, [visible]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as `${number}%`,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.85)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: 24,
            padding: 28,
            alignItems: 'center',
            gap: 20,
            width: 300,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text
            style={{
              color: Colors.text.muted,
              fontSize: 11,
              fontFamily: 'Inter_600SemiBold',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Short Ad
          </Text>

          {/* Ad placeholder */}
          <View
            style={{
              width: 240,
              height: 130,
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 32 }}>📱</Text>
            <Text
              style={{
                color: Colors.text.muted,
                fontSize: 13,
                fontFamily: 'Inter_400Regular',
              }}
            >
              Ad plays here
            </Text>
          </View>

          <Text
            style={{
              color: Colors.text.secondary,
              fontSize: 13,
              fontFamily: 'Inter_400Regular',
              textAlign: 'center',
            }}
          >
            Game starts after the ad
          </Text>

          {/* Countdown badge */}
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: 'rgba(59,130,246,0.12)',
              borderWidth: 2.5,
              borderColor: Colors.blue,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: Colors.blue, fontSize: 24, fontFamily: 'Syne_800ExtraBold' }}>
              {countdown}
            </Text>
          </View>

          {/* Progress bar */}
          <View
            style={{
              width: '100%',
              height: 3,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={[
                { height: '100%', backgroundColor: Colors.blue, borderRadius: 2 },
                progressStyle,
              ]}
            />
          </View>

          <Text
            style={{
              color: Colors.text.muted,
              fontSize: 11,
              fontFamily: 'Inter_400Regular',
              textAlign: 'center',
            }}
          >
            Go Premium to skip ads forever
          </Text>
        </View>
      </View>
    </Modal>
  );
}
