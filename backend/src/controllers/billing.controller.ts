import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { billingService } from '../services/billing.service.js';
import { AppError } from '../utils/errors.js';

function verifyRevenueCatWebhookSecret(request: FastifyRequest) {
  const expectedSecret = env.REVENUECAT_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    throw new AppError(503, 'RevenueCat webhook secret is not configured.', 'BILLING_WEBHOOK_NOT_CONFIGURED');
  }

  const authorization = request.headers.authorization?.trim() ?? '';
  const providedSecret =
    authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : authorization;

  if (providedSecret !== expectedSecret) {
    throw new AppError(401, 'Invalid billing webhook authorization.', 'INVALID_BILLING_WEBHOOK_AUTH');
  }
}

export async function revenueCatWebhookController(request: FastifyRequest, reply: FastifyReply) {
  verifyRevenueCatWebhookSecret(request);
  const result = await billingService.processRevenueCatWebhook(request.body as Record<string, unknown>);
  return reply.code(200).send(result);
}

export async function myEntitlementController(request: FastifyRequest, reply: FastifyReply) {
  const entitlement = await billingService.getUserEntitlement(request.auth.userId);
  return reply.code(200).send(entitlement);
}
