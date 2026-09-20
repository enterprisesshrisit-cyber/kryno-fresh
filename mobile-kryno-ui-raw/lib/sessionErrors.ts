export const SESSION_EXPIRED_MESSAGE = 'Session expired, please login again.';

const UNRECOVERABLE_AUTH_ERROR =
  /session expired|refresh token reuse|invalid refresh token|refresh token expired|refresh token does not match|device mismatch|REFRESH_REUSE_DETECTED|INVALID_REFRESH_TOKEN|REFRESH_EXPIRED|DEVICE_MISMATCH|["']exp["'] claim timestamp check failed/i;

export function isUnrecoverableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return UNRECOVERABLE_AUTH_ERROR.test(message);
}

export function safeUserFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (isUnrecoverableAuthError(message) || /access token expired|please refresh your session/i.test(message)) {
    return SESSION_EXPIRED_MESSAGE;
  }

  if (/secure relay is reconnecting|secure relay is not connected|direct relay socket|relay error/i.test(message)) {
    return 'Connecting call service. Please try again in a few seconds.';
  }

  if (/rate limit/i.test(message)) {
    return 'Please wait a moment before trying again.';
  }

  if (/provider does not exist|push_provider|column .* does not exist/i.test(message)) {
    return 'Kryno is finishing a service update. Please reopen the app and try again.';
  }

  return message || fallback;
}
