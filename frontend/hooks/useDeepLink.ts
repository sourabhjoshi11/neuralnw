import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

/**
 * Handles deep links:
 * - classchaos://feed/CODE → /feed/CODE
 * - classchaos://game/CODE → /game/CODE
 * - classchaos://chor-sipahi/CODE → /chor-sipahi/CODE
 * - classchaos://join/feed/CODE → /feed/join?code=CODE
 * - classchaos://join/game/CODE → /game/join?code=CODE
 */
export function useDeepLink() {
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const url = event.url;
      if (!url) return;

      const parsed = Linking.parse(url);
      const path = parsed.path ?? '';
      const segments = path.split('/').filter(Boolean);

      if (segments[0] === 'join' && segments[1] === 'feed' && segments[2]) {
        router.push(`/feed/join?code=${segments[2]}`);
      } else if (segments[0] === 'join' && segments[1] === 'game' && segments[2]) {
        router.push(`/game/join?code=${segments[2]}`);
      } else if (segments[0] === 'feed' && segments[1]) {
        router.push(`/feed/${segments[1]}`);
      } else if (segments[0] === 'game' && segments[1]) {
        router.push(`/game/${segments[1]}`);
      } else if (segments[0] === 'chor-sipahi' && segments[1]) {
        router.push(`/chor-sipahi/${segments[1]}`);
      }
    };

    // Handle link that opened the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    // Handle links while app is open
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);
}
