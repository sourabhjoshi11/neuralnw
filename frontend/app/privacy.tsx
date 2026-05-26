import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.secondary} />
        </Pressable>
        <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>Privacy Policy</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>Last updated: May 26, 2025</Text>

        <Section title="1. Information We Collect">
          {`• Phone number (for authentication)\n• Display name you choose\n• Messages, images, and videos you send in feeds\n• Game activity and scores`}
        </Section>

        <Section title="2. How We Use Your Information">
          {`• To create and manage your account\n• To enable messaging and game features\n• To display leaderboards and scores\n• To improve app performance`}
        </Section>

        <Section title="3. Data Storage">
          {`Your data is stored securely on cloud servers (Supabase). Messages and media are stored as long as the feed exists. You can delete your account at any time from Settings.`}
        </Section>

        <Section title="4. Data Sharing">
          {`We do not sell or share your personal data with third parties. Your messages are only visible to members of the feeds you join.`}
        </Section>

        <Section title="5. Your Rights">
          {`• Access your data\n• Delete your account and all associated data\n• Leave any feed at any time\n• Report inappropriate content`}
        </Section>

        <Section title="6. Security">
          {`We use industry-standard encryption and secure protocols to protect your data. Authentication is handled via OTP verification.`}
        </Section>

        <Section title="7. Children's Privacy">
          {`ClassChaos is intended for users aged 13 and above. We do not knowingly collect data from children under 13.`}
        </Section>

        <Section title="8. Changes to This Policy">
          {`We may update this policy from time to time. Continued use of the app constitutes acceptance of the updated policy.`}
        </Section>

        <Section title="9. Contact Us">
          {`For questions about this privacy policy or to request data deletion, contact us at:\n\nEmail: support@classchaos.app`}
        </Section>

        <View style={{ height: 20 }} />

        <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', marginTop: 12 }}>Terms of Service</Text>

        <Section title="1. Acceptance">
          {`By using ClassChaos, you agree to these terms. If you do not agree, do not use the app.`}
        </Section>

        <Section title="2. User Conduct">
          {`• No harassment, bullying, or hate speech\n• No sharing of explicit or illegal content\n• No impersonation of others\n• No spamming or flooding feeds`}
        </Section>

        <Section title="3. Content">
          {`You retain ownership of content you post. By posting, you grant ClassChaos a license to display it within the app. We may remove content that violates these terms.`}
        </Section>

        <Section title="4. Account Termination">
          {`We reserve the right to suspend or terminate accounts that violate these terms without prior notice.`}
        </Section>

        <Section title="5. Disclaimer">
          {`ClassChaos is provided "as is" without warranties. We are not liable for any damages arising from use of the app.`}
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_600SemiBold' }}>{title}</Text>
      <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 20 }}>{children}</Text>
    </View>
  );
}
