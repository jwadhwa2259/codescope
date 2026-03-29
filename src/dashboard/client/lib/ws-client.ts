/**
 * WebSocket connection manager with auto-reconnect and exponential backoff.
 * Connects to ws://{host}/ws and dispatches parsed JSON events to handlers.
 */

export type WSEvent =
  | { type: 'bootstrap:progress'; stage: string; percentage: number }
  | { type: 'orient:phase'; phase: string }
  | { type: 'agent:spawn'; agent: string; wave: number }
  | { type: 'agent:complete'; agent: string; status: string }
  | { type: 'graph:updated' }
  | { type: 'readiness:snapshot' };

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnected';

export interface WebSocketClient {
  connect(): void;
  disconnect(): void;
  onEvent(handler: (event: WSEvent) => void): () => void;
  isConnected(): boolean;
}

const BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_BACKOFF = 30000;

export function createWebSocketClient(
  onStatusChange: (status: ConnectionStatus) => void,
): WebSocketClient {
  let ws: WebSocket | null = null;
  let connected = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;
  const handlers = new Set<(event: WSEvent) => void>();

  function getBackoffDelay(): number {
    if (reconnectAttempt < BACKOFF_SCHEDULE.length) {
      return BACKOFF_SCHEDULE[reconnectAttempt];
    }
    return MAX_BACKOFF;
  }

  function scheduleReconnect(): void {
    if (intentionalClose) return;
    const delay = getBackoffDelay();
    reconnectAttempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect(true);
    }, delay);
  }

  function doConnect(isReconnect = false): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectAttempt = 0;
      onStatusChange(isReconnect ? 'reconnected' : 'connected');
    };

    ws.onclose = () => {
      connected = false;
      ws = null;
      onStatusChange('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnect
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WSEvent;
        for (const handler of handlers) {
          handler(parsed);
        }
      } catch {
        // Ignore unparseable messages
      }
    };
  }

  return {
    connect() {
      intentionalClose = false;
      doConnect(false);
    },

    disconnect() {
      intentionalClose = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
      connected = false;
    },

    onEvent(handler: (event: WSEvent) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    isConnected() {
      return connected;
    },
  };
}
