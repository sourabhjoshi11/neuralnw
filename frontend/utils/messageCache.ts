import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedMessage } from '@/types';

const CACHE_PREFIX = 'feed_messages_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours (matches message auto-delete)

export async function cacheMessages(feedCode: string, messages: FeedMessage[]) {
  try {
    await AsyncStorage.setItem(
      `${CACHE_PREFIX}${feedCode}`,
      JSON.stringify({ messages, timestamp: Date.now() })
    );
  } catch {}
}

export async function getCachedMessages(feedCode: string): Promise<FeedMessage[]> {
  try {
    const cached = await AsyncStorage.getItem(`${CACHE_PREFIX}${feedCode}`);
    if (!cached) return [];
    const { messages, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${feedCode}`);
      return [];
    }
    return messages;
  } catch {
    return [];
  }
}

export async function clearCache(feedCode: string) {
  try {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${feedCode}`);
  } catch {}
}
