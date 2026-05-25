import { Modal, View, Text, Pressable } from "react-native";
import { Colors } from "@/constants/theme";
import { VoiceBubble } from "./VoiceBubble";

type Props = {
  visible: boolean;
  voiceUri: string | null;
  sending: boolean;
  onCancel: () => void;
  onSend: (uri: string) => void;
};

export function VoicePreviewModal({ visible, voiceUri, sending, onCancel, onSend }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center", padding: 20 }}>
        <View style={{ backgroundColor: Colors.bg.card, borderRadius: 20, padding: 24, width: "100%", maxWidth: 320, gap: 16 }}>
          <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: "Poppins_600SemiBold", textAlign: "center" }}>
            Voice Message Preview
          </Text>
          {voiceUri && <VoiceBubble url={voiceUri} color={Colors.cyan} />}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: Colors.text.secondary, fontSize: 15, fontFamily: "Poppins_600SemiBold" }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => voiceUri && onSend(voiceUri)} disabled={sending} style={{ flex: 1, backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: sending ? 0.6 : 1 }}>
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Poppins_600SemiBold" }}>{sending ? "Sending..." : "Send"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
