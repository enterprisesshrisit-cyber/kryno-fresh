type Tokens = { accessToken: string; refreshToken: string };

export class SessionChangedError extends Error {
  constructor() {
    super('Your sign-in changed. Please try again.');
    this.name = 'SessionChangedError';
  }
}

export class SessionLifecycle<T extends Tokens> {
  private revision = 0;
  private session: T | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private inFlight: Promise<T> | null = null;
  private rotated: T | null = null;

  constructor(private readonly deps: {
    persist(session: T | null): Promise<void>;
    publish(session: T | null): void;
  }) {}

  current() { return this.session; }

  private check(revision: number) {
    if (revision !== this.revision) throw new SessionChangedError();
  }

  private commit(next: T | null, revision: number) {
    const result = this.tail.then(async () => {
      this.check(revision);
      await this.deps.persist(next);
      this.check(revision);
      this.session = next;
      this.deps.publish(next);
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  async replace(next: T | null) {
    const revision = ++this.revision;
    this.inFlight = null;
    this.rotated = null;
    // Stop old-account requests immediately, not after remote logout completes.
    this.session = null;
    this.deps.publish(null);
    await this.commit(next, revision);
  }

  refresh(exchange: (session: T) => Promise<Tokens>, failedAccessToken?: string): Promise<T> {
    const current = this.session;
    if (!current) return Promise.reject(new Error('Session expired, please login again.'));
    // A late 401 from an old request must not rotate a newly refreshed session again.
    if (failedAccessToken && failedAccessToken !== current.accessToken) return Promise.resolve(current);
    if (this.inFlight) return this.inFlight;
    const revision = this.revision;
    const work = (async () => {
      if (!this.rotated) {
        const tokens = await exchange(current);
        this.check(revision);
        this.rotated = { ...current, ...tokens };
      }
      const next = this.rotated;
      // If secure persistence fails, retry these same tokens without reusing the old
      // refresh token on the server. Logout/account changes discard this memory.
      await this.commit(next, revision);
      this.rotated = null;
      return next;
    })();
    this.inFlight = work;
    void work.finally(() => {
      if (this.inFlight === work) this.inFlight = null;
    }).catch(() => undefined);
    return work;
  }
}
