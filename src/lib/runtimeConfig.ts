const BACKEND_ORIGIN_KEY = 'kryno_backend_origin';
const FALLBACK_LAN_ORIGIN = 'http://192.168.243.116:8080';

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

function isNativeLikeHost() {
  return window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost';
}

function isLocalTestingOrigin(origin: string) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|192\.168\.)/i.test(origin);
}

function isTemporaryTunnelOrigin(origin: string) {
  return /trycloudflare\.com$/i.test(new URL(origin).hostname);
}

export function getBackendOrigin() {
  const configured =
    (typeof localStorage !== 'undefined' ? localStorage.getItem(BACKEND_ORIGIN_KEY) : null) ||
    (import.meta as ImportMetaWithEnv).env?.VITE_KRYNO_BACKEND_ORIGIN ||
    '';

  const currentOrigin = window.location.origin.replace(/\/+$/, '');

  if (!isNativeLikeHost()) {
    if (!configured) {
      return currentOrigin;
    }

    const normalizedConfigured = configured.replace(/\/+$/, '');

    try {
      const configuredUrl = new URL(normalizedConfigured);
      const currentUrl = new URL(currentOrigin);
      const staleConfiguredOrigin =
        isLocalTestingOrigin(normalizedConfigured) ||
        (isTemporaryTunnelOrigin(normalizedConfigured) && configuredUrl.hostname !== currentUrl.hostname);

      if (staleConfiguredOrigin) {
        return currentOrigin;
      }
    } catch {
      return currentOrigin;
    }

    return normalizedConfigured;
  }

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (isNativeLikeHost()) {
    return FALLBACK_LAN_ORIGIN;
  }

  return window.location.origin.replace(/\/+$/, '');
}

export function getBackendOriginStorageKey() {
  return BACKEND_ORIGIN_KEY;
}

export function setBackendOrigin(origin: string) {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized || typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(BACKEND_ORIGIN_KEY, normalized);
}

export function clearBackendOrigin() {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(BACKEND_ORIGIN_KEY);
}

export function getApiBase() {
  return `${getBackendOrigin()}/api`;
}

export function getRelayWsBase() {
  const origin = getBackendOrigin();

  if (origin.startsWith('https://')) {
    return origin.replace(/^https:\/\//, 'wss://');
  }

  if (origin.startsWith('http://')) {
    return origin.replace(/^http:\/\//, 'ws://');
  }

  return origin;
}
