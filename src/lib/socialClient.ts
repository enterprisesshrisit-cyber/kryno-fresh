import { getApiBase, getBackendOrigin } from './runtimeConfig';

type AuthSession = {
  user: {
    id: string;
    username: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
};

export type SocialProfile = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export type SocialComment = {
  id: string;
  body: string;
  createdAt: string;
  username: string;
  displayName: string;
};

export type SocialPost = {
  id: string;
  caption: string;
  visibility: 'public' | 'followers';
  createdAt: string;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaKind: 'text' | 'image' | 'video';
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  comments: SocialComment[];
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type SocialStory = {
  id: string;
  caption: string;
  visibility: 'public' | 'followers' | 'private_circle';
  createdAt: string;
  expiresAt: string;
  mediaUrl: string;
  mediaMimeType: string;
  viewedByMe: boolean;
  viewCount: number;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type SocialBootstrap = {
  me: SocialProfile;
  feed: SocialPost[];
  stories: SocialStory[];
  suggestions: SocialProfile[];
};

const REQUEST_TIMEOUT_MS = 20_000;
const MEDIA_TIMEOUT_MS = 180_000;

async function socialJson<T>(accessToken: string, path: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    const headers = new Headers(options.headers ?? {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    response = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
  } finally {
    window.clearTimeout(timeout);
  }

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof json?.message === 'string'
        ? json.message
        : typeof json?.error === 'string'
          ? json.error
          : 'Social request failed.'
    );
  }

  return json as T;
}

function toBase64(bytes: ArrayBuffer) {
  const chunkSize = 0x8000;
  const view = new Uint8Array(bytes);
  let output = '';

  for (let offset = 0; offset < view.length; offset += chunkSize) {
    const slice = view.subarray(offset, Math.min(view.length, offset + chunkSize));
    output += String.fromCharCode(...slice);
  }

  return btoa(output);
}

function inferMimeTypeFromFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.mp4') || normalized.endsWith('.m4v')) return 'video/mp4';
  if (normalized.endsWith('.mov')) return 'video/quicktime';
  if (normalized.endsWith('.webm')) return 'video/webm';
  return null;
}

function normalizeUploadMimeType(file: File) {
  const rawMimeType = file.type.trim().toLowerCase();

  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType === 'video/x-m4v') return 'video/mp4';
  if (rawMimeType === 'video/mov') return 'video/quicktime';
  if (rawMimeType) return rawMimeType;

  return inferMimeTypeFromFileName(file.name) ?? 'application/octet-stream';
}

export function resolveSocialMediaUrl(url: string | null) {
  if (!url) {
    return null;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `${getBackendOrigin()}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function fetchSocialBootstrap(session: AuthSession) {
  return socialJson<SocialBootstrap>(session.accessToken, '/social/bootstrap');
}

export async function uploadSocialMedia(session: AuthSession, kind: 'avatar' | 'post' | 'story', file: File) {
  const bytes = await file.arrayBuffer();
  return socialJson<{ assetId: string; url: string; mimeType: string; byteSize: number }>(
    session.accessToken,
    '/social/media',
    {
      method: 'POST',
      body: JSON.stringify({
        kind,
        fileName: file.name,
        mimeType: normalizeUploadMimeType(file),
        bytesBase64: toBase64(bytes)
      })
    },
    MEDIA_TIMEOUT_MS
  );
}

export async function updateMyProfile(
  session: AuthSession,
  input: { displayName?: string; bio?: string; avatarMediaId?: string | null }
) {
  return socialJson<SocialProfile>(session.accessToken, '/social/profile/me', {
    method: 'PUT',
    body: JSON.stringify(input)
  });
}

export async function followUser(session: AuthSession, username: string) {
  return socialJson<SocialProfile>(session.accessToken, `/social/follow/${encodeURIComponent(username)}`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function unfollowUser(session: AuthSession, username: string) {
  return socialJson<SocialProfile>(session.accessToken, `/social/follow/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    body: JSON.stringify({})
  });
}

export async function createPost(
  session: AuthSession,
  input: { caption: string; visibility: 'public' | 'followers'; mediaAssetId?: string | null }
) {
  return socialJson<SocialPost>(session.accessToken, '/social/posts', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function deletePost(session: AuthSession, postId: string) {
  return socialJson<{ success: true; postId: string }>(session.accessToken, `/social/posts/${postId}`, {
    method: 'DELETE'
  });
}

export async function likePost(session: AuthSession, postId: string) {
  return socialJson<SocialPost>(session.accessToken, `/social/posts/${postId}/like`, {
    method: 'POST'
  });
}

export async function unlikePost(session: AuthSession, postId: string) {
  return socialJson<SocialPost>(session.accessToken, `/social/posts/${postId}/like`, {
    method: 'DELETE'
  });
}

export async function addPostComment(session: AuthSession, postId: string, body: string) {
  return socialJson<SocialPost>(session.accessToken, `/social/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
}

export async function createStory(
  session: AuthSession,
  input: { caption: string; visibility: 'public' | 'followers' | 'private_circle'; mediaAssetId: string }
) {
  return socialJson<SocialStory>(session.accessToken, '/social/stories', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function markStoryViewed(session: AuthSession, storyId: string) {
  return socialJson<SocialStory | null>(session.accessToken, `/social/stories/${storyId}/view`, {
    method: 'POST'
  });
}
