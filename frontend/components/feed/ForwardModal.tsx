import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { FeedMessage } from "@/types";

type Props = {
  visible: boolean;
  message: FeedMessage | null;
  feeds: { id: string; code: string; name: string }[];
  onClose: () => void;
  onForward: (targetCode: string) => void;
};

export function ForwardModal({ visible, message, feeds, onClose, onForward }: Props) {
  if (!message) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={{ backgroundColor: Colors.bg.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: "Poppins_600SemiBold", paddingHorizontal: 24, marginBottom: 16 }}>
              Forward to...
            </Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {feeds.length === 0 ? (
                <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", paddingVertical: 20 }}>
                  No other feeds available
                </Text>
              ) : (
                feeds.map((f) => (
                  <Pressable key={f.code} onPress={() => onForward(f.code)} android_ripple={{ color: "rgba(255,255,255,0.07)" }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 16 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.cyan + "22", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="chatbubbles" size={20} color={Colors.cyan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: "Poppins_600SemiBold" }}>{f.name}</Text>
                      <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: "Poppins_400Regular" }}>{f.code}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.text.muted} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
