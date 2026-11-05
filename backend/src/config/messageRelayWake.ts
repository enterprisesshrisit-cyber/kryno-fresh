import { z } from 'zod';

// A canary grants no recipient authority; normal message/owner checks still apply.
export const messageRelayWakeTargetsSchema = z.string().max(1024).default('[]').transform((raw, ctx) => {
  try { return JSON.parse(raw) as unknown; }
  catch {
    ctx.addIssue({ code: 'custom', message: 'Relay-wake targets must be a JSON array.' });
    return z.NEVER;
  }
}).pipe(z.array(z.object({
  recipientUserId: z.string().uuid().transform(value => value.toLowerCase()),
  deviceSessionId: z.string().uuid().transform(value => value.toLowerCase())
}).strict()).max(2));
