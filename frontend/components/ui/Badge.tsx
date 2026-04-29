import { View, Text } from 'react-native';

type Props = {
  label: string;
  color?: string;
};

export function Badge({ label, color = '#3b82f6' }: Props) {
  return (
    <View
      style={{
        backgroundColor: `${color}20`,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: `${color}40`,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </View>
  );
}
