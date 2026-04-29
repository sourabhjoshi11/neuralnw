import { Pressable, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BorderRadius, SpringConfig } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  colors?: [string, string];
  size?: 'sm' | 'md' | 'lg';
  haptic?: boolean;
};

const SIZE_STYLES = {
  sm: { paddingVertical: 10, paddingHorizontal: 20, fontSize: 14 },
  md: { paddingVertical: 14, paddingHorizontal: 32, fontSize: 15 },
  lg: { paddingVertical: 16, paddingHorizontal: 48, fontSize: 16 },
};

export function GradientButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  colors = ['#3b82f6', '#06b6d4'],
  size = 'lg',
  haptic = true,
}: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const sz = SIZE_STYLES[size];
  const active = !disabled && !loading;

  const handlePressIn = () => {
    scale.value = withSpring(0.95, SpringConfig.snappy);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, SpringConfig.default);
  };
  const handlePress = () => {
    if (!active) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!active}
      style={{ width: '100%' }}
    >
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={active ? colors : ['#1a2235', '#1a2235']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: sz.paddingVertical,
            paddingHorizontal: sz.paddingHorizontal,
            borderRadius: BorderRadius.btn,
            alignItems: 'center',
            shadowColor: active ? colors[0] : 'transparent',
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 4 },
            elevation: active ? 8 : 0,
          }}
        >
          <Text
            style={{
              color: active ? '#fff' : '#475569',
              fontSize: sz.fontSize,
              fontFamily: 'Syne_800ExtraBold',
            }}
          >
            {loading ? 'Loading...' : label}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
