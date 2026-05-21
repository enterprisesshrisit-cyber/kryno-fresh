const { expo } = require('./app.json');

module.exports = () => {
  const isStoreBuild =
    process.env.EAS_BUILD_PROFILE === 'production' ||
    process.env.KRYNO_BUILD_ENV === 'production';

  if (isStoreBuild && !process.env.EXPO_PUBLIC_KRYNO_API_URL) {
    throw new Error('EXPO_PUBLIC_KRYNO_API_URL is required for production mobile builds.');
  }

  if (isStoreBuild && !process.env.EXPO_PUBLIC_SENTRY_DSN) {
    throw new Error('EXPO_PUBLIC_SENTRY_DSN is required for production mobile builds.');
  }

  if (
    isStoreBuild &&
    process.env.EXPO_PUBLIC_KRYNO_API_URL &&
    /localhost|127\.0\.0\.1|trycloudflare\.com/i.test(process.env.EXPO_PUBLIC_KRYNO_API_URL)
  ) {
    throw new Error('Production mobile builds must use a permanent HTTPS API URL, not localhost or trycloudflare.');
  }

  return expo;
};
