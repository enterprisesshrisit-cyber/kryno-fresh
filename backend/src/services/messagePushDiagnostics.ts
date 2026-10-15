type PushOutcome = {
  attempted?: number;
  sent?: number;
  disabled?: boolean;
  failed?: boolean;
  skipped?: 'muted' | 'focus-mode' | 'dispatch-task-failed';
};

function count(value: number | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// Do not spread provider results: they may later contain tokens or private data.
export function messagePushDiagnostic(messageId: string, excludedSessions: number, outcome: PushOutcome) {
  const attempted = count(outcome.attempted);
  const accepted = count(outcome.sent);
  const invalidCounts = (outcome.attempted !== undefined && attempted !== outcome.attempted)
    || (outcome.sent !== undefined && accepted !== outcome.sent) || accepted > attempted;
  const reason = outcome.skipped ?? (outcome.disabled ? 'schema-unavailable'
    : outcome.failed ? 'dispatch-failed'
    : invalidCounts ? 'invalid-outcome'
    : attempted === 0 ? 'no-eligible-targets'
    : accepted === attempted ? 'provider-accepted'
    : accepted > 0 ? 'partial-acceptance' : 'not-accepted');
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
  return {
    reason,
    relayExcludedCount: count(excludedSessions),
    attemptedCount: attempted,
    acceptedCount: accepted,
    ...(validId ? { messageTag: messageId.slice(-12).toLowerCase() } : {})
  };
}
