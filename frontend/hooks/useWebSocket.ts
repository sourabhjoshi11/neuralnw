import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import type { WSMessage } from '@/types';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://api.classchaos.app';
const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

// Close codes that mean "don't bother reconnecting"
const FATAL_CLOSE_CODES = new Set([4001, 4003, 4004, 4005]);

type UseWebSocketOptions = {
  roomCode: string;
  playerId: string;
  token: string;
  onMessage: (msg: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Called when the server closes with a fatal code (bad token / room ended / not a member) */
  onFatalError?: (code: number, reason: string) => void;
};

export function useWebSocket({
  roomCode,
  playerId,
  token,
  onMessage,
  onOpen,
  onClose,
  onFatalError,
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

    // Track the last error message received before close
    let lastErrorPayload: { code: number; reason: string } | null = null;

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        if (msg.type === 'pong') return;
        // Capture server-sent error payloads so onclose can use them
        if (msg.type === 'error' && (msg as any).code) {
          lastErrorPayload = { code: (msg as any).code, reason: (msg as any).reason ?? 'unknown' };
          return;
        }
        onMessage(msg);
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror, handle reconnect there
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      clearTimers();
      setConnected(false);
      onClose?.();

      // If server sent a fatal close code, stop reconnecting
      const closeCode = event.code;
      const isFatal = FATAL_CLOSE_CODES.has(closeCode) || (lastErrorPayload && FATAL_CLOSE_CODES.has(lastErrorPayload.code));
      if (isFatal) {
        const errorCode = lastErrorPayload?.code ?? closeCode;
        const errorReason = lastErrorPayload?.reason ?? 'connection_rejected';
        onFatalError?.(errorCode, errorReason);
        return;
      }

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
