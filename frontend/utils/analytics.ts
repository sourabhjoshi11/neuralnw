import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

export async function initAnalytics() {
  if (!POSTHOG_API_KEY) return;
  posthog = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
  await posthog.ready();
}

export const analytics = {
  track(event: string, properties?: Record<string, any>) {
    posthog?.capture(event, properties);
  },
  screen(name: string) {
    posthog?.screen(name);
  },
  identify(userId: string, traits?: Record<string, any>) {
    posthog?.identify(userId, traits);
  },
  reset() {
    posthog?.reset();
  },
};
