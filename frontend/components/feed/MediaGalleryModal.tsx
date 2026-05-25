import { Modal, View, Text, Pressable, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { FeedMessage } from "@/types";

type Props = {
  visible: boolean;
  messages: FeedMessage[];
  onClose: () => void;
};

export function MediaGalleryModal({ visible, messages, onClose }: Props) {
  const mediaMessages = messages.filter((m) => m.mediaUrl && (m.msgType === "image" || m.msgType === "video")).reverse();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text.primary} />
            </Pressable>
            <Text style={{ flex: 1, color: Colors.text.primary, fontSize: 18, fontFamily: "Poppins_600SemiBold", marginLeft: 16 }}>
              Media Gallery
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
            {mediaMessages.map((msg) => (
              <Pressable
                key={msg.id}
                onPress={() => {
                  const { Linking } = require("react-native");
                  Linking.openURL(msg.mediaUrl!);
                }}
                style={{ width: "33.33%", aspectRatio: 1, padding: 2 }}
              >
                <Image source={{ uri: msg.mediaUrl! }} style={{ width: "100%", height: "100%", borderRadius: 4 }} resizeMode="cover" />
                {msg.msgType === "video" && (
                  <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12, padding: 4 }}>
                    <Ionicons name="play" size={16} color="#fff" />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
