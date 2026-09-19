import type { FastifyInstance } from 'fastify';

type Dependencies = {
  environment: string;
  database(): Promise<unknown>;
  redis?: () => Promise<unknown>;
  timeoutMs?: number;
};

async function check(probe: () => Promise<unknown>, timeoutMs: number): Promise<'ok' | 'failed'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe timeout')), timeoutMs); })
    ]);
    return 'ok';
  } catch { return 'failed'; }
  finally { clearTimeout(timer); }
}

export function registerHealthRoutes(app: FastifyInstance, dependencies: Dependencies) {
  // Liveness must not call a dependency or its rate-limit store. Dependency
  // outages belong in readiness, not in Render's process health check.
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({
    ok: true, service: 'kryno-api', environment: dependencies.environment
  }));

  app.get('/api/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const started = Date.now();
    const timeoutMs = dependencies.timeoutMs ?? 3000;
    const [database, redis] = await Promise.all([
      check(dependencies.database, timeoutMs),
      dependencies.redis ? check(dependencies.redis, timeoutMs) : Promise.resolve('not_configured')
    ]);
    const ok = database === 'ok' && (redis === 'ok' || (redis === 'not_configured' && dependencies.environment !== 'production'));
    return reply.code(ok ? 200 : 503).send({
      ok, service: 'kryno-api', checks: { database, redis }, latencyMs: Date.now() - started
    });
  });
}
