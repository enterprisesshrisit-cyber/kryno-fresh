import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SecureSignalStoreCore } from './mobileSignalSecureStoreCore';

const secureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export class SecureSignalStore extends SecureSignalStoreCore {
  constructor(namespace: string) {
    super(namespace, {
      asyncStorage: AsyncStorage,
      secureStore: SecureStore,
      secureOptions: secureStoreOptions
    });
  }
}

export { fromBase64, signalRawKey, signalSecureStoreKey, toBase64 } from './mobileSignalSecureStoreCore';
