import { View, Text, Modal, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius } from '@/constants/theme';
import { useFeedStore } from '@/store/feedStore';

export function FeedPaywall({
  visible,
  onClose,
  onUpgrade,
}: {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const store = useFeedStore();

  const handleWatchAd = () => {
    // Placeholder: real impl would call AdMob rewarded ad
    Alert.alert(
      'Ad Watched',
      'Thanks for watching! +3 messages added to your weekly limit.',
      [
        {
          text: 'Nice!',
          onPress: () => {
            store.setWeeklyCount(
              Math.max(0, store.weeklyCount - 3),
              store.resetAt ?? new Date().toISOString()
            );
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              gap: 20,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.08)',
            }}
          >
            {/* Handle bar */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignSelf: 'center',
              }}
            />

            {/* Header */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 36 }}>🔒</Text>
              <Text
                style={{
                  color: Colors.text.primary,
                  fontSize: 20,
                  fontFamily: 'Syne_900Black',
                  textAlign: 'center',
                }}
              >
                Weekly Limit Reached
              </Text>
              <Text
                style={{
                  color: Colors.text.secondary,
                  fontSize: 14,
                  fontFamily: 'Inter_400Regular',
                  textAlign: 'center',
                  lineHeight: 22,
                }}
              >
                Free users get 5 messages per week.{'\n'}
                Watch a short ad for 3 extra, or go premium.
              </Text>
            </View>

            {/* Watch Ad option */}
            <Pressable onPress={handleWatchAd}>
              <View
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: BorderRadius.card,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <Text style={{ fontSize: 26 }}>📺</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: Colors.text.primary,
                      fontSize: 15,
                      fontFamily: 'Syne_800ExtraBold',
                    }}
                  >
                    Watch a short ad
                  </Text>
                  <Text
                    style={{
                      color: Colors.text.muted,
                      fontSize: 12,
                      fontFamily: 'Inter_400Regular',
                    }}
                  >
                    Get +3 messages this week
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.15)',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      color: Colors.blue,
                      fontSize: 13,
                      fontFamily: 'Inter_700Bold',
                    }}
                  >
                    +3
                  </Text>
                </View>
              </View>
            </Pressable>

            {/* Premium option */}
            <Pressable onPress={onUpgrade}>
              <LinearGradient
                colors={['#3b82f6', '#8b5cf6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: BorderRadius.card,
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  shadowColor: '#3b82f6',
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 8,
                }}
              >
                <Text style={{ fontSize: 26 }}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: '#fff', fontSize: 15, fontFamily: 'Syne_900Black' }}
                  >
                    Go Premium
                  </Text>
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.75)',
                      fontSize: 12,
                      fontFamily: 'Inter_400Regular',
                    }}
                  >
                    Unlimited messages · No ads · ₹29/month
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text
                style={{
                  color: Colors.text.muted,
                  fontSize: 13,
                  fontFamily: 'Inter_400Regular',
                }}
              >
                Maybe later
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
