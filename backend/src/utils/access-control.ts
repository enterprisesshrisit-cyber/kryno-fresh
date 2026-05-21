type DirectAttachmentAccessInput = {
  currentUserId: string;
  currentSessionId: string;
  senderUserId: string;
  recipientUserId: string;
  recipientDeviceSessionId: string | null;
};

export function canAccessDirectAttachment(input: DirectAttachmentAccessInput) {
  if (input.senderUserId === input.currentUserId) {
    return true;
  }

  if (input.recipientUserId !== input.currentUserId) {
    return false;
  }

  return !input.recipientDeviceSessionId || input.recipientDeviceSessionId === input.currentSessionId;
}

export function canUseOwnedMediaAsset(input: {
  currentUserId: string;
  ownerUserId: string;
  expectedKind: string;
  actualKind: string;
}) {
  return input.currentUserId === input.ownerUserId && input.expectedKind === input.actualKind;
}

export function canViewSocialObject(input: {
  viewerUserId: string;
  ownerUserId: string;
  visibility: 'public' | 'followers' | 'private_circle';
  viewerFollowsOwner: boolean;
}) {
  if (input.viewerUserId === input.ownerUserId) {
    return true;
  }

  if (input.visibility === 'public') {
    return true;
  }

  if (input.visibility === 'followers') {
    return input.viewerFollowsOwner;
  }

  return false;
}
