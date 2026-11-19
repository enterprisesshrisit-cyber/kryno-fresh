import { z } from 'zod';

const id = z.uuid().transform(value => value.toLowerCase());
const target = z.strictObject({
  userId: id,
  deviceSessionId: id,
  deviceId: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/)
});

export const installationTrialTargetsSchema = z.string().max(1024).default('[]').transform((raw, ctx) => {
  try { return JSON.parse(raw) as unknown; }
  catch {
    ctx.addIssue({ code: 'custom', message: 'Installation trial targets must be a JSON array.' });
    return z.NEVER;
  }
}).pipe(z.array(target).max(2).refine(
  targets => new Set(targets.map(value => value.deviceId)).size === targets.length &&
    new Set(targets.map(value => value.deviceSessionId)).size === targets.length,
  'Each test installation and session must appear at most once.'
));

export const refreshRecoveryTargetsSchema = installationTrialTargetsSchema;
