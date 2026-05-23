import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

export type LinkPreview = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
};

const URL_REGEX = /https?:\/\/[^\s]+/i;

const cache = new Map<string, LinkPreview | null>();

export function useLinkPreview(text: string): LinkPreview | null {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const match = text.match(URL_REGEX);
    if (!match || !token) { setPreview(null); return; }
    const url = match[0];

    if (cache.has(url)) { setPreview(cache.get(url) ?? null); return; }

    let cancelled = false;
    fetch(`${API_URL}/feed/link-preview?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: LinkPreview) => {
        if (cancelled) return;
        const result = data.title ? data : null;
        cache.set(url, result);
        setPreview(result);
      })
      .catch(() => { cache.set(url, null); });

    return () => { cancelled = true; };
  }, [text, token]);

  return preview;
}
