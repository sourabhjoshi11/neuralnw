import { View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  accentGradient?: boolean;
  padding?: number;
};

export function Card({ children, style, accentGradient = true, padding = 20 }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: Colors.bg.card,
          borderRadius: BorderRadius.card,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {accentGradient && (
        <LinearGradient
          colors={['#3b82f6', '#06b6d4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 2 }}
        />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}
