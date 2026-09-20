type Session = { accessToken: string };
export type RelaySocket = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export function connectAuthenticatedRelay(options: {
  url: string;
  getSession(): Session | null;
  onPayload(payload: any): Promise<void>;
  onStatus?(status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string): void;
  createSocket?: (url: string) => RelaySocket;
  reconnectMs?: number;
  authTimeoutMs?: number;
}) {
  let disposed = false;
  let socket: RelaySocket | null = null;
  let authenticated = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let authTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const waiters = new Set<{ finish(connected: boolean): void }>();
  const connected = () => !disposed && authenticated && socket?.readyState === 1;
  const finishWaiters = (value: boolean) => {
    for (const waiter of [...waiters]) waiter.finish(value);
  };
  const clearTimers = () => {
    clearTimeout(authTimer);
    clearInterval(heartbeat);
  };
  const scheduleReconnect = () => {
    if (disposed || reconnectTimer || !options.getSession()) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      open();
    }, options.reconnectMs ?? 3000);
  };
  const open = () => {
    if (disposed || !options.getSession()) return;
    options.onStatus?.('connecting');
    let active: RelaySocket;
    try {
      active = options.createSocket
        ? options.createSocket(options.url)
        : new WebSocket(options.url) as unknown as RelaySocket;
    } catch {
      options.onStatus?.('error', 'Unable to connect. Retrying...');
      scheduleReconnect();
      return;
    }
    socket = active;
    authenticated = false;
    const isCurrent = () => !disposed && socket === active;
    const closeAndRetry = () => {
      if (!isCurrent()) return;
      socket = null;
      authenticated = false;
      clearTimers();
      active.close();
      options.onStatus?.('disconnected');
      scheduleReconnect();
    };
    authTimer = setTimeout(closeAndRetry, options.authTimeoutMs ?? 15000);
    active.onopen = () => {
      if (!isCurrent()) return;
      const session = options.getSession();
      if (!session) { closeAndRetry(); return; }
      try {
        active.send(JSON.stringify({ type: 'auth', accessToken: session.accessToken }));
      } catch { closeAndRetry(); }
    };
    active.onmessage = (event) => {
      if (!isCurrent()) return;
      void (async () => {
        const payload = JSON.parse(String(event.data));
        if (payload.type === 'relay_error') {
          options.onStatus?.('error', typeof payload.message === 'string' ? payload.message : 'Relay error.');
          closeAndRetry();
          return;
        }
        if (payload.type === 'relay_ready') {
          clearTimeout(authTimer);
          authenticated = true;
          finishWaiters(true);
          options.onStatus?.('connected');
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            try { if (isCurrent() && connected()) active.send(JSON.stringify({ type: 'ping' })); }
            catch { closeAndRetry(); }
          }, 15000);
          return;
        }
        if (payload.type !== 'pong' && authenticated) await options.onPayload(payload);
      })().catch(() => {
        // Decryption/parser failures may contain payload text. Do not log them.
        if (isCurrent()) options.onStatus?.('error', 'Unable to process an incoming event. Please try again.');
      });
    };
    active.onclose = closeAndRetry;
    active.onerror = closeAndRetry;
  };
  open();

  return {
    send(command: unknown) {
      if (!connected() || !options.getSession()) return false;
      try { socket!.send(JSON.stringify(command)); return true; }
      catch { socket?.onerror?.(); return false; }
    },
    waitUntilConnected(timeoutMs = 6500) {
      if (connected()) return Promise.resolve(true);
      if (disposed || !options.getSession()) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const waiter = { finish(value: boolean) { clearTimeout(timer); waiters.delete(waiter); resolve(value); } };
        const timer = setTimeout(() => waiter.finish(false), timeoutMs);
        waiters.add(waiter);
      });
    },
    disconnect() {
      disposed = true;
      authenticated = false;
      clearTimeout(reconnectTimer);
      clearTimers();
      finishWaiters(false);
      const active = socket;
      socket = null;
      active?.close();
    }
  };
}
