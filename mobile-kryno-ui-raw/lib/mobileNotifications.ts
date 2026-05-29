import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

const MESSAGE_CHANNEL_ID = 'kryno-messages';
const CALL_CHANNEL_ID = 'kryno-calls';

type RegisteredPushToken = {
  provider: 'expo' | 'fcm';
  token: string;
  platform: 'android' | 'ios' | 'web';
};

let configured = false;

function getExpoProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

export async function configureKrynoNotifications() {
  if (configured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true
    })
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
      name: 'Kryno messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#8B5CF6',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      enableVibrate: true,
      enableLights: true
    });

    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Kryno calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 180, 500, 180, 500],
      lightColor: '#EC4899',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true
    });
  }

  configured = true;
}

export async function registerKrynoPushToken(): Promise<RegisteredPushToken[]> {
  await configureKrynoNotifications();

  const current = await Notifications.getPermissionsAsync();
  const finalStatus =
    current.status === 'granted'
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') {
    console.log('[KrynoNotifications] permission not granted');
    return [];
  }

  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';

  if (Platform.OS === 'android') {
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      const token = typeof deviceToken.data === 'string' ? deviceToken.data : JSON.stringify(deviceToken.data);
      if (token) {
        console.log('[KrynoNotifications] native Android FCM token registered');
        return [
          {
            provider: 'fcm',
            token,
            platform
          }
        ];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'native push token unavailable';
      console.warn('[KrynoNotifications] native push token unavailable; trying Expo fallback', message);
    }
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn('[KrynoNotifications] Expo project id missing; push token skipped');
    return [];
  }

  let token: Notifications.ExpoPushToken;
  try {
    token = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'push token unavailable';
    console.warn('[KrynoNotifications] remote push token unavailable; local notifications remain enabled', message);
    return [];
  }

  console.log('[KrynoNotifications] Expo push token registered');

  return [
    {
      provider: 'expo',
      token: token.data,
      platform
    }
  ];
}

export async function showForegroundMessageNotification(input: { senderLabel?: string }) {
  await configureKrynoNotifications();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New Kryno message',
      body: input.senderLabel ? `${input.senderLabel} sent you a private message.` : 'You have a new private message.',
      sound: 'default',
      data: {
        type: 'direct_message'
      }
    },
    trigger: Platform.OS === 'android' ? { channelId: MESSAGE_CHANNEL_ID } : null
  });
}

export async function showForegroundCallNotification(input: { callerLabel?: string; mode?: 'audio' | 'video' }) {
  await configureKrynoNotifications();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Incoming Kryno ${input.mode === 'video' ? 'video' : 'audio'} call`,
      body: input.callerLabel ? `${input.callerLabel} is calling you.` : 'Incoming Kryno call.',
      sound: 'default',
      data: {
        type: 'call_invite'
      }
    },
    trigger: Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : null
  });
}

export async function clearKrynoNotifications() {
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  await Notifications.setBadgeCountAsync(0).catch(() => undefined);
}
