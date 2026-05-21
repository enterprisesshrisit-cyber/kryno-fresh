import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticAssets from '@fastify/static';
import websocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { pool } from './db/pool.js';
import { attachmentsRoutes } from './routes/attachments.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { billingRoutes } from './routes/billing.routes.js';
import { callsRoutes } from './routes/calls.routes.js';
import { keysRoutes } from './routes/keys.routes.js';
import { messagesRoutes } from './routes/messages.routes.js';
import { relayRoutes } from './routes/relay.routes.js';
import { socialRoutes } from './routes/social.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { AppError } from './utils/errors.js';
import { env } from './config/env.js';
import { isAllowedCorsOrigin } from './utils/security.js';
import { captureException, initObservability } from './services/observability.service.js';
import { closeRateLimitRedisClient, getRateLimitRedisClient } from './services/rate-limit-store.service.js';

export async function buildApp() {
  initObservability();
  const rateLimitRedis = getRateLimitRedisClient();
  const rateLimitStoreOptions = rateLimitRedis ? { redis: rateLimitRedis as never } : {};

  const app = Fastify({
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          'request.headers.authorization',
          'headers.authorization',
          'body.password',
          'body.new_password',
          'body.refresh_token',
          'body.code',
          'body.device_public_key',
          'body.encryptedBytesBase64'
        ],
        remove: true
      }
    },
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024
  });
  const frontendDistCandidates = [resolve(process.cwd(), '..', 'dist'), resolve(process.cwd(), 'dist')];
  const frontendDist = frontendDistCandidates.find((candidate) => existsSync(candidate));
  const hasFrontendDist = Boolean(frontendDist);
  const socialMediaRoot = resolve(process.cwd(), env.SOCIAL_MEDIA_STORAGE_DIR);
  await mkdir(socialMediaRoot, { recursive: true });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin, env.APP_BASE_URL)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS.'), false);
    },
    credentials: true
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    reply.removeHeader('Server');

    const proto = request.headers['x-forwarded-proto'];
    if (proto === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    return payload;
  });

  app.addContentTypeParser(['text/plain', 'text/plain;charset=UTF-8'], { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  await app.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 1
    }
  });

  await app.register(websocket);

  await app.register(rateLimit, {
    ...rateLimitStoreOptions,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => `${request.ip}:${request.url}`
  });

  app.addHook('onClose', async () => {
    await closeRateLimitRedisClient();
  });

  app.get('/api/health', async () => ({
    ok: true,
    service: 'kryno-api',
    environment: env.APP_ENV
  }));

  app.get('/api/ready', async (_request, reply) => {
    const startedAt = Date.now();

    try {
      await pool.query('select 1');
      return reply.code(200).send({
        ok: true,
        service: 'kryno-api',
        checks: {
          database: 'ok'
        },
        latencyMs: Date.now() - startedAt
      });
    } catch (error) {
      captureException(error, {
        route: '/api/ready',
        check: 'database'
      });

      return reply.code(503).send({
        ok: false,
        service: 'kryno-api',
        checks: {
          database: 'failed'
        }
      });
    }
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 8,
      timeWindow: '1 minute'
    });
    await instance.register(authRoutes, { prefix: '/api/auth' });
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 20,
      timeWindow: '1 minute'
    });
    await instance.register(keysRoutes, { prefix: '/api/keys' });
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 60,
      timeWindow: '1 minute'
    });
    await instance.register(usersRoutes, { prefix: '/api/users' });
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 60,
      timeWindow: '1 minute'
    });
    await instance.register(callsRoutes, { prefix: '/api/calls' });
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 240,
      timeWindow: '1 minute'
    });
    await instance.register(messagesRoutes, { prefix: '/api/messages' });
  });

  await app.register(relayRoutes, { prefix: '/api/messages' });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 60,
      timeWindow: '1 minute'
    });
    await instance.register(billingRoutes, { prefix: '/api/billing' });
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 80,
      timeWindow: '1 minute'
    });
    await instance.register(attachmentsRoutes, { prefix: '/api/attachments' });
  });

  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      ...rateLimitStoreOptions,
      max: 120,
      timeWindow: '1 minute'
    });
    await instance.register(socialRoutes, { prefix: '/api/social' });
  });

  await app.register(staticAssets, {
    root: socialMediaRoot,
    prefix: '/media/',
    decorateReply: false
  });

  if (hasFrontendDist) {
    await app.register(staticAssets, {
      root: frontendDist,
      prefix: '/',
      index: ['index.html'],
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('index.html')) {
          response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          response.setHeader('Pragma', 'no-cache');
          response.setHeader('Expires', '0');
        }
      }
    });

    app.get('/', (_request, reply) => {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      return reply.sendFile('index.html');
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Route not found.'
        });
      }

      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      return reply.sendFile('index.html');
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        issues: error.flatten()
      });
    }

    if (error instanceof AppError) {
      if (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 429) {
        app.log.warn(
          {
            code: error.code,
            path: _request.url,
            method: _request.method,
            ip: _request.ip
          },
          error.message
        );
      }

      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message
      });
    }

    captureException(error, {
      path: _request.url,
      method: _request.method,
      ip: _request.ip
    });

    app.log.error(error);
    return reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.'
    });
  });

  return app;
}
