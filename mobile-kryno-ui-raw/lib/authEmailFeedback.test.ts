import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordResetRequestNotice, resendVerificationNotice } from './authEmailFeedback';

test('password reset feedback does not reveal whether an account exists', () => {
  const notice = passwordResetRequestNotice();
  assert.match(notice, /If this email has a Kryno account/);
  assert.doesNotMatch(notice, /failed|SMTP|sent to your email/i);
});

test('verification resend feedback does not claim delivery for an unknown email', () => {
  const notice = resendVerificationNotice();
  assert.match(notice, /If this email needs verification/);
  assert.doesNotMatch(notice, /failed|SMTP/i);
});

test('development previews remain visible only when provided', () => {
  assert.match(passwordResetRequestNotice('123456'), /123456/);
  assert.match(resendVerificationNotice('654321'), /654321/);
});
