type StorageDependencies = {
  secure: {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
  };
  legacy: {
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  };
};

export class SessionStorageError extends Error {
  constructor() {
    super('Unable to access secure sign-in storage. Please unlock your phone and try again.');
    this.name = 'SessionStorageError';
  }
}

export function createSessionStorage(key: string, { secure, legacy }: StorageDependencies) {
  let tail: Promise<unknown> = Promise.resolve();
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation).catch(() => { throw new SessionStorageError(); });
    tail = result.catch(() => undefined);
    return result;
  };

  const writeVerified = async (value: string) => {
    await secure.setItemAsync(key, value);
    if (await secure.getItemAsync(key) !== value) throw new SessionStorageError();
  };

  return {
    read: () => serialized(async () => {
      // Secure state wins over a legacy copy left behind by interrupted cleanup.
      const current = await secure.getItemAsync(key);
      const old = await legacy.getItem(key);
      if (current !== null) {
        if (old !== null) await legacy.removeItem(key);
        return current;
      }
      if (old !== null) {
        await writeVerified(old);
        await legacy.removeItem(key);
      }
      return old;
    }),
    write: (value: string) => serialized(async () => {
      await writeVerified(value);
      await legacy.removeItem(key);
    }),
    clear: () => serialized(async () => {
      // Try both stores even if one fails. Never leave the fallback authenticated.
      const results = await Promise.allSettled([
        secure.deleteItemAsync(key), legacy.removeItem(key)
      ]);
      if (results.some((result) => result.status === 'rejected')) throw new SessionStorageError();
    })
  };
}
