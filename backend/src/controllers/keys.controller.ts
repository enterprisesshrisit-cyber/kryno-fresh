import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { keysService } from '../services/keys.service.js';

const uploadBundleSchema = z.object({
  registrationId: z.number().int().positive(),
  identityPublicKey: z.string().min(16),
  signedPrekey: z.object({
    keyId: z.number().int().nonnegative(),
    publicKey: z.string().min(16),
    signature: z.string().min(16)
  }),
  oneTimePrekeys: z
    .array(
      z.object({
        keyId: z.number().int().nonnegative(),
        publicKey: z.string().min(16)
      })
    )
    .max(500)
});

const fetchBundleParamsSchema = z.object({
  lookup: z.string().min(3).max(128)
});

export async function uploadBundleController(request: FastifyRequest, reply: FastifyReply) {
  const body = uploadBundleSchema.parse(request.body);
  const result = await keysService.uploadBundle({
    userId: request.auth.userId,
    sessionId: request.auth.sessionId,
    registrationId: body.registrationId,
    identityPublicKey: body.identityPublicKey,
    signedPrekey: body.signedPrekey,
    oneTimePrekeys: body.oneTimePrekeys
  });

  return reply.code(200).send(result);
}

export async function fetchRecipientBundlesController(request: FastifyRequest, reply: FastifyReply) {
  const params = fetchBundleParamsSchema.parse(request.params);
  const result = await keysService.fetchRecipientBundles({
    lookup: params.lookup
  });

  return reply.code(200).send(result);
}
