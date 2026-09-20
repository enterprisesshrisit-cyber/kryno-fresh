export function passwordResetRequestNotice(previewCode?: string) {
  if (previewCode) {
    return `Reset code sent. Development preview: ${previewCode}`;
  }

  return 'If this email has a Kryno account, check your inbox for a reset code. If it does not arrive, try again later.';
}

export function resendVerificationNotice(previewCode?: string) {
  if (previewCode) {
    return `New code sent. Development preview: ${previewCode}`;
  }

  return 'If this email needs verification, check your inbox for a new code.';
}
