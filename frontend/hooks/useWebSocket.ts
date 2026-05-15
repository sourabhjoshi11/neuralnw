import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import type { WSMessage } from '@/types';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://api.classchaos.app';
const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

type UseWebSocketOptions = {
  roomCode: string;
  playerId: string;
  token: string;
  onMessage: (msg: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export function useWebSocket({
  roomCode,
  playerId,
  token,
  onMessage,
  onOpen,
  onClose,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const { setConnected, setReconnecting, incrementReconnectAttempts, resetReconnectAttempts, reconnectAttempts } =
    useGameStore();

  const getBackoffDelay = (attempts: number) =>
    Math.min(1000 * Math.pow(2, attempts), MAX_RECONNECT_DELAY_MS);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const sendRaw = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const url = `${WS_URL}/ws/game/${roomCode}?pid=${playerId}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      resetReconnectAttempts();
      onOpen?.();

      pingTimerRef.current = setInterval(() => {
        sendRaw({ type: 'ping', data: {} });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        if (msg.type === 'pong') return;
        onMessage(msg);
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror, handle reconnect there
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      clearTimers();
      setConnected(false);
      onClose?.();

      if (mountedRef.current) {
        setReconnecting(true);
        incrementReconnectAttempts();
        const delay = getBackoffDelay(reconnectAttempts);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };
  }, [roomCode, playerId, token, onMessage, onOpen, onClose, reconnectAttempts]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && wsRef.current?.readyState !== WebSocket.OPEN) {
        clearTimers();
        connect();
      }
    };

    // AppState not available on web
    const subscription = Platform.OS !== 'web'
      ? AppState.addEventListener('change', handleAppStateChange)
      : null;

    return () => {
      mountedRef.current = false;
      clearTimers();
      wsRef.current?.close();
      subscription?.remove();
    };
  }, []);

  return { send: sendRaw };
}
