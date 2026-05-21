import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessDirectAttachment, canUseOwnedMediaAsset, canViewSocialObject } from './access-control.js';

test('direct attachment access allows sender', () => {
  assert.equal(
    canAccessDirectAttachment({
      currentUserId: 'sender',
      currentSessionId: 'session-a',
      senderUserId: 'sender',
      recipientUserId: 'recipient',
      recipientDeviceSessionId: 'session-b'
    }),
    true
  );
});

test('direct attachment access allows intended recipient device', () => {
  assert.equal(
    canAccessDirectAttachment({
      currentUserId: 'recipient',
      currentSessionId: 'session-b',
      senderUserId: 'sender',
      recipientUserId: 'recipient',
      recipientDeviceSessionId: 'session-b'
    }),
    true
  );
});

test('direct attachment access rejects wrong recipient device session', () => {
  assert.equal(
    canAccessDirectAttachment({
      currentUserId: 'recipient',
      currentSessionId: 'session-c',
      senderUserId: 'sender',
      recipientUserId: 'recipient',
      recipientDeviceSessionId: 'session-b'
    }),
    false
  );
});

test('owned media asset check rejects IDOR against another owner', () => {
  assert.equal(
    canUseOwnedMediaAsset({
      currentUserId: 'user-a',
      ownerUserId: 'user-b',
      expectedKind: 'post',
      actualKind: 'post'
    }),
    false
  );
});

test('owned media asset check rejects kind confusion', () => {
  assert.equal(
    canUseOwnedMediaAsset({
      currentUserId: 'user-a',
      ownerUserId: 'user-a',
      expectedKind: 'avatar',
      actualKind: 'post'
    }),
    false
  );
});

test('social visibility allows public and followed content but blocks private circle', () => {
  assert.equal(
    canViewSocialObject({
      viewerUserId: 'viewer',
      ownerUserId: 'owner',
      visibility: 'public',
      viewerFollowsOwner: false
    }),
    true
  );
  assert.equal(
    canViewSocialObject({
      viewerUserId: 'viewer',
      ownerUserId: 'owner',
      visibility: 'followers',
      viewerFollowsOwner: true
    }),
    true
  );
  assert.equal(
    canViewSocialObject({
      viewerUserId: 'viewer',
      ownerUserId: 'owner',
      visibility: 'private_circle',
      viewerFollowsOwner: true
    }),
    false
  );
});
