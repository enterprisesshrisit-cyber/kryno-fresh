import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { DISCOVER_CATEGORIES, DISCOVER_POSTS, FEATURED_MEMBERS, FEED_POSTS, ME, PROFILE_POSTS, STORIES } from './data';
import {
  addMobileIceCandidate,
  applyMobileAnswer,
  applyMobileOffer,
  createMobileCallPeerConnection,
  getMobileFallbackIceServers,
  requestMobileCallMedia,
  setMobileCameraEnabled,
  setMobileMicrophoneMuted,
  setMobileRuntimeIceServers,
  stopMobileMediaStream,
  type MobileCallMode,
  type MobileIceConfig
} from './mobileCall';

type AuthUser = {
  id: string;
  username: string;
  email: string;
};

type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

type DeviceProfile = {
  deviceId: string;
  deviceName: string;
  deviceSeed: string;
};

type MediaUploadInput = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  bytesBase64?: string | null;
};

type SocialProfile = {
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

type SocialPost = {
  id: string;
  caption: string;
  visibility: 'public' | 'followers' | 'private_circle';
  createdAt: string;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaKind: 'text' | 'image' | 'video';
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    username: string;
    displayName: string;
  }>;
};

type SocialStory = {
  id: string;
  caption: string;
  visibility: 'public' | 'followers' | 'private_circle';
  createdAt: string;
  expiresAt: string;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  mediaUrl: string;
  mediaMimeType: string;
  viewedByMe: boolean;
  viewCount: number;
};

type SocialMediaUpload = {
  assetId: string;
  url: string;
  mimeType: string;
  byteSize: number;
};

type SocialBootstrap = {
  me: SocialProfile;
  feed: SocialPost[];
  stories: SocialStory[];
  suggestions: SocialProfile[];
};

type BillingEntitlement = {
  entitlementId: string;
  active: boolean;
  status: string;
  productId: string | null;
  currentPeriodEndsAt: string | null;
};

type LiveKitCallToken = {
  provider: 'livekit';
  url: string;
  token: string;
  roomName: string;
  mode: MobileCallMode;
  participantIdentity: string;
  participantName: string;
  recipientUserId: string | null;
  recipientUsername: string | null;
  expiresInSeconds: number;
  e2eeRequired: boolean;
};

type SearchUser = {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
};

type RelayDirectMessage = {
  messageId: string;
  senderUserId: string;
  senderDeviceSessionId: string;
  recipientDeviceSessionId: string | null;
  messageType: string;
  ciphertext: string;
  encryptedContentType: string;
  clientCreatedAt: string;
  serverReceivedAt: string;
  expiresAt: string | null;
};

type FeedPostModel = typeof FEED_POSTS[number] & {
  likedByMe?: boolean;
  mediaKind?: 'text' | 'image' | 'video';
  username?: string;
  commentItems?: SocialPost['comments'];
};

type StoryModel = typeof STORIES[number] & {
  username?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  caption?: string;
  viewedByMe?: boolean;
  viewCount?: number;
  expiresAt?: string;
  createdAt?: string;
};
type MeModel = typeof ME;
type FeaturedMemberModel = typeof FEATURED_MEMBERS[number] & {
  isFollowing?: boolean;
};
type ConversationSeed = (typeof import('./data').CONVERSATIONS)[number] & {
  conversationKey: string;
  userId?: string;
  recipientLookup: string;
};
type ProfilePostModel = typeof PROFILE_POSTS[number];
type ChatMessageModel = (typeof import('./data').MESSAGES)[number] & {
  conversationKey: string;
  createdAt: string;
  remoteMessageId?: string;
  status?: 'sending' | 'sent' | 'failed' | 'received';
};
type CallStateModel = {
  callId: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  phase: 'ringing' | 'connecting' | 'connected';
  mode: MobileCallMode;
  mediaProvider: 'livekit' | 'webrtc';
  roomName?: string | null;
  liveKitToken?: LiveKitCallToken | null;
  mediaEncryptionKey?: string | null;
  remoteLabel: string;
  remoteSessionId: string | null;
  muted: boolean;
  cameraEnabled: boolean;
  status: string;
  startedAt: string;
  connectedAt?: string;
};
type KnownChatUser = {
  id?: string;
  username: string;
  displayName: string;
  avatar: string;
  tier: typeof FEATURED_MEMBERS[number]['tier'];
  mood: typeof FEATURED_MEMBERS[number]['mood'];
  online: boolean;
  handle: string;
};

type MobileSignalMessage = {
  id: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  kind: 'text';
  text: string;
  createdAt: string;
  senderLabel: string;
};

type MobileSignalCallMediaKey = {
  id: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  kind: 'call_media_key';
  callId: string;
  mode: MobileCallMode;
  mediaProvider: 'livekit';
  roomName: string;
  mediaEncryptionKey: string;
  createdAt: string;
  senderLabel: string;
};

type MobileSignalEnvelope = MobileSignalMessage | MobileSignalCallMediaKey;

type RelayHandle = {
  send: (command: Record<string, unknown> & { type: string }) => boolean;
  disconnect: () => void;
};

type SignupResponse = {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  verificationEmailSent: boolean;
  verificationCodePreview?: string;
};

type VerificationResponse = {
  verified: boolean;
};

type ResendVerificationResponse = {
  ok: boolean;
  verificationEmailSent: boolean;
  verificationCodePreview?: string;
};

type PasswordResetRequestResponse = {
  ok: boolean;
  resetEmailSent: boolean;
  resetCodePreview?: string;
};

type PasswordResetResponse = {
  ok: boolean;
};

let mobileSignalModulePromise: Promise<typeof import('./mobileSignal')> | null = null;

async function getMobileSignalModule() {
  if (!mobileSignalModulePromise) {
    mobileSignalModulePromise = import('./mobileSignal');
  }

  return mobileSignalModulePromise;
}

type KrynoBackendContextValue = {
  initialized: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string;
  backendOrigin: string;
  setBackendOrigin: (value: string) => Promise<void>;
  session: AuthSession | null;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (input: { username: string; email: string; password: string }) => Promise<{
    email: string;
    username: string;
    verificationEmailSent: boolean;
    verificationCodePreview?: string;
  }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ verificationEmailSent: boolean; verificationCodePreview?: string }>;
  requestPasswordReset: (email: string) => Promise<{ resetEmailSent: boolean; resetCodePreview?: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSocial: () => Promise<void>;
  refreshBilling: () => Promise<void>;
  billingEntitlement: BillingEntitlement;
  currentUser: MeModel;
  feedPosts: FeedPostModel[];
  stories: StoryModel[];
  featuredMembers: FeaturedMemberModel[];
  discoverPosts: typeof DISCOVER_POSTS;
  discoverCategories: typeof DISCOVER_CATEGORIES;
  profilePosts: ProfilePostModel[];
  conversationSeeds: ConversationSeed[];
  getConversationMessages: (conversationKey: string) => ChatMessageModel[];
  sendConversationMessage: (conversation: Pick<ConversationSeed, 'conversationKey' | 'recipientLookup' | 'user'>, text: string) => Promise<void>;
  ensureConversationForUser: (user: SearchUser) => ConversationSeed;
  markConversationRead: (conversationKey: string) => void;
  currentCall: CallStateModel | null;
  localCallStreamUrl: string | null;
  remoteCallStreamUrl: string | null;
  createLiveKitCallToken: (input: { mode: MobileCallMode; recipientLookup?: string; roomName?: string }) => Promise<LiveKitCallToken>;
  startConversationCall: (conversation: Pick<ConversationSeed, 'conversationKey' | 'recipientLookup' | 'user'>, mode: MobileCallMode) => Promise<void>;
  acceptCurrentCall: () => Promise<void>;
  rejectCurrentCall: (reason?: string) => Promise<void>;
  endCurrentCall: (reason?: string) => Promise<void>;
  toggleCurrentCallMute: () => void;
  toggleCurrentCallCamera: () => void;
  updateCurrentCallTransport: (input: { phase?: CallStateModel['phase']; status: string; connectedAt?: string }) => void;
  searchUsers: (query: string) => Promise<SearchUser[]>;
  getSocialProfile: (username: string) => Promise<SocialProfile>;
  togglePostLike: (postId: string) => Promise<void>;
  commentOnPost: (postId: string, body: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  toggleFollow: (username: string, isFollowing: boolean) => Promise<void>;
  saveProfile: (input: { displayName: string; bio: string }) => Promise<void>;
  uploadProfilePhoto: (input: MediaUploadInput) => Promise<void>;
  createPostFromMedia: (input: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    bytesBase64?: string | null;
    caption?: string;
  }) => Promise<void>;
  createTextPost: (input: { caption: string }) => Promise<void>;
  createStoryFromMedia: (input: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    bytesBase64?: string | null;
    caption?: string;
  }) => Promise<void>;
  viewStory: (storyId: string) => Promise<void>;
};

const SESSION_STORAGE_KEY = 'kryno_mobile_auth_session';
const BACKEND_ORIGIN_STORAGE_KEY = 'kryno_mobile_backend_origin';
const DEVICE_PROFILE_STORAGE_KEY = 'kryno_mobile_device_profile';
const MOBILE_CHAT_MESSAGES_STORAGE_KEY = 'kryno_mobile_chat_messages_v1';
const MOBILE_CHAT_THREADS_STORAGE_KEY = 'kryno_mobile_chat_threads_v1';
const MOBILE_CHAT_KNOWN_USERS_STORAGE_KEY = 'kryno_mobile_chat_known_users_v1';
const MOBILE_CHAT_SEEN_INBOX_STORAGE_KEY = 'kryno_mobile_chat_seen_inbox_v1';
const MOBILE_STORAGE_SCHEMA_KEY = 'kryno_mobile_storage_schema_version';
const MOBILE_STORAGE_SCHEMA_VERSION = '2026-05-27-calls-enabled-v1';
const RESET_ON_SCHEMA_CHANGE_KEYS = [
  MOBILE_CHAT_MESSAGES_STORAGE_KEY,
  MOBILE_CHAT_THREADS_STORAGE_KEY,
  MOBILE_CHAT_KNOWN_USERS_STORAGE_KEY,
  MOBILE_CHAT_SEEN_INBOX_STORAGE_KEY
];
const DEFAULT_BACKEND_ORIGIN =
  process.env.EXPO_PUBLIC_KRYNO_API_URL ||
  process.env.EXPO_PUBLIC_KRYNO_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (__DEV__ ? 'http://127.0.0.1:8080' : 'https://kryno-api-staging.onrender.com');
const BUILD_LOCKED_BACKEND_ORIGIN = !__DEV__ && DEFAULT_BACKEND_ORIGIN.trim()
  ? DEFAULT_BACKEND_ORIGIN.trim().replace(/\/+$/, '')
  : '';
const STABLE_STARTUP_MODE = process.env.EXPO_PUBLIC_KRYNO_STABLE_STARTUP === 'true';

const TIER_SEQUENCE = ['Basic', 'Inner Circle', 'Elite'] as const;
const MOOD_SEQUENCE = ['chill', 'social', 'focus'] as const;

const KrynoBackendContext = createContext<KrynoBackendContextValue | null>(null);
const FREE_BILLING_ENTITLEMENT: BillingEntitlement = {
  entitlementId: 'free',
  active: false,
  status: 'free',
  productId: null,
  currentPeriodEndsAt: null
};

function createId() {
  const random = Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${random}`;
}

function createManagedCallRoomName(mode: MobileCallMode, callId: string) {
  return `kryno-${mode}-${callId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
}

function buildDevicePublicKey(seed: string) {
  return `kryno-mobile-device-${seed}`;
}

function pickTier(seed: number) {
  return TIER_SEQUENCE[Math.abs(seed) % TIER_SEQUENCE.length];
}

function pickMood(seed: number) {
  return MOOD_SEQUENCE[Math.abs(seed) % MOOD_SEQUENCE.length];
}

function computeHash(value: string) {
  return value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function fallbackAvatar(label: string, avatarUrl?: string | null) {
  if (avatarUrl) {
    return avatarUrl.startsWith('http') ? avatarUrl : `${avatarUrl}`;
  }

  const seed = encodeURIComponent(safeText(label.replace(/^@/, ''), 'Kryno'));
  return `https://api.dicebear.com/9.x/initials/png?seed=${seed}&backgroundColor=111827&fontColor=e5e7eb`;
}

function resolveMediaUrl(backendOrigin: string, mediaUrl: string | null | undefined, fallback: string) {
  if (!mediaUrl) {
    return fallback;
  }

  if (/^https?:\/\//i.test(mediaUrl)) {
    return mediaUrl;
  }

  return `${backendOrigin}${mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`}`;
}

function sniffBase64MediaMimeType(value?: string | null) {
  const normalized = value?.replace(/^data:([^;]+);base64,/, '').replace(/\s+/g, '') ?? '';
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('/9j/')) return 'image/jpeg';
  if (normalized.startsWith('iVBORw0KGgo')) return 'image/png';
  if (normalized.startsWith('R0lGODdh') || normalized.startsWith('R0lGODlh')) return 'image/gif';
  if (normalized.startsWith('UklGR') && normalized.slice(8, 24).includes('V0VCUA')) return 'image/webp';
  if (normalized.slice(0, 40).includes('ZnR5cXF0')) return 'video/quicktime';
  if (normalized.slice(0, 40).includes('ZnR5c')) return 'video/mp4';
  if (normalized.startsWith('GkXf')) return 'video/webm';
  return '';
}

function mediaExtensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/quicktime') return 'mov';
  if (mimeType === 'video/webm') return 'webm';
  return 'jpg';
}

function guessMimeType(uri: string, mimeType?: string | null) {
  if (mimeType) {
    return mimeType;
  }

  const lower = uri.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'image/jpeg';
}

function guessFileName(uri: string, fileName: string | null | undefined, mimeType: string) {
  if (fileName?.trim()) {
    return fileName.trim();
  }

  const fromUri = uri.split('/').pop()?.split('?')[0];
  if (fromUri?.includes('.')) {
    return fromUri;
  }

  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : mimeType === 'video/mp4'
            ? 'mp4'
            : mimeType === 'video/quicktime'
              ? 'mov'
              : mimeType === 'video/webm'
                ? 'webm'
                : 'jpg';
  return `kryno-media-${Date.now()}.${extension}`;
}

function ensureFileNameMatchesMimeType(fileName: string, mimeType: string) {
  const extension = mediaExtensionForMimeType(mimeType);
  const cleanName = fileName.trim() || `kryno-media-${Date.now()}.${extension}`;
  return cleanName.replace(/\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i, `.${extension}`);
}

function formatTimeAgo(value: string) {
  const createdAt = new Date(value);
  const diffMs = Date.now() - createdAt.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatClockTime(value: string) {
  const createdAt = new Date(value);
  return createdAt.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function pickKeywords(text: string) {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((word) => word.length >= 5)
    .slice(0, 3);
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function loadStoredJson<T>(key: string, fallback: T) {
  const stored = await AsyncStorage.getItem(key);
  if (!stored) {
    return fallback;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {};
}

async function migrateMobileStartupStorage() {
  const currentVersion = await AsyncStorage.getItem(MOBILE_STORAGE_SCHEMA_KEY);
  if (currentVersion === MOBILE_STORAGE_SCHEMA_VERSION) {
    return;
  }

  await Promise.all(RESET_ON_SCHEMA_CHANGE_KEYS.map((key) => AsyncStorage.removeItem(key)));
  await AsyncStorage.setItem(MOBILE_STORAGE_SCHEMA_KEY, MOBILE_STORAGE_SCHEMA_VERSION);
}

function getRelayWebSocketUrl(origin: string) {
  if (origin.startsWith('https://')) {
    return `${origin.replace(/^https:\/\//, 'wss://')}/api/messages/ws`;
  }

  if (origin.startsWith('http://')) {
    return `${origin.replace(/^http:\/\//, 'ws://')}/api/messages/ws`;
  }

  return `${origin}/api/messages/ws`;
}

async function secureGet(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function secureSet(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function secureDelete(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

async function loadDeviceProfile() {
  const stored = await AsyncStorage.getItem(DEVICE_PROFILE_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<DeviceProfile>;
      if (parsed.deviceId && parsed.deviceName && parsed.deviceSeed) {
        return parsed as DeviceProfile;
      }
    } catch {
      await AsyncStorage.removeItem(DEVICE_PROFILE_STORAGE_KEY);
    }
  }

  const profile: DeviceProfile = {
    deviceId: createId(),
    deviceName: 'Kryno Mobile',
    deviceSeed: createId()
  };

  await AsyncStorage.setItem(DEVICE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

async function parseJsonResponse<T>(response: Response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof json?.message === 'string'
        ? json.message
        : typeof json?.error === 'string'
          ? json.error
          : 'Request failed.';
    throw new Error(message);
  }
  return json as T;
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = 20_000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The server took too long to respond. Please try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type ApiFetchInit = RequestInit & {
  timeoutMs?: number;
};

async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function requireBackendOrigin(origin: string) {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('KRYNO API is not configured for this build.');
  }

  return normalized;
}

export function KrynoBackendProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [backendOrigin, setBackendOriginState] = useState(DEFAULT_BACKEND_ORIGIN);
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [bootstrap, setBootstrap] = useState<SocialBootstrap | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [billingEntitlement, setBillingEntitlement] = useState<BillingEntitlement>(FREE_BILLING_ENTITLEMENT);
  const [chatMessages, setChatMessages] = useState<ChatMessageModel[]>([]);
  const [storedThreads, setStoredThreads] = useState<ConversationSeed[]>([]);
  const [knownChatUsers, setKnownChatUsers] = useState<Record<string, KnownChatUser>>({});
  const [seenInboxMessageIds, setSeenInboxMessageIds] = useState<string[]>([]);
  const [currentCall, setCurrentCall] = useState<CallStateModel | null>(null);
  const [localCallStreamUrl, setLocalCallStreamUrl] = useState<string | null>(null);
  const [remoteCallStreamUrl, setRemoteCallStreamUrl] = useState<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const seenInboxRef = useRef<Set<string>>(new Set());
  const knownUsersRef = useRef<Record<string, KnownChatUser>>({});
  const relayHandleRef = useRef<RelayHandle | null>(null);
  const currentCallRef = useRef<CallStateModel | null>(null);
  const handleRelayCallEventRef = useRef<((event: any) => Promise<void>) | null>(null);
  const localCallStreamRef = useRef<any | null>(null);
  const remoteCallStreamRef = useRef<any | null>(null);
  const peerConnectionRef = useRef<any | null>(null);
  const peerConnectionCallIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingCallMediaKeysRef = useRef<Map<string, MobileSignalCallMediaKey>>(new Map());

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    currentCallRef.current = currentCall;
  }, [currentCall]);

  const apiFetch = useCallback(
    async <T,>(path: string, init: ApiFetchInit = {}, allowRefresh = true): Promise<T> => {
      const apiOrigin = requireBackendOrigin(backendOrigin);
      const activeSession = sessionRef.current;
      const { timeoutMs, ...requestInit } = init;
      const headers = new Headers(requestInit.headers ?? {});
      const body = requestInit.body;
      const isFormDataBody =
        typeof FormData !== 'undefined' &&
        (body instanceof FormData ||
          Object.prototype.toString.call(body) === '[object FormData]' ||
          (typeof body === 'object' && body !== null && Object.prototype.hasOwnProperty.call(body, '_parts')));

      if (!isFormDataBody) {
        headers.set('Content-Type', 'application/json');
      }

      if (activeSession?.accessToken) {
        headers.set('Authorization', `Bearer ${activeSession.accessToken}`);
      }

      const response = await fetchWithTimeout(`${apiOrigin}/api${path}`, {
        ...requestInit,
        headers
      }, timeoutMs ?? 20_000);

      if (response.status === 401 && allowRefresh && activeSession && deviceProfile) {
        const refreshResponse = await fetchWithTimeout(`${apiOrigin}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: activeSession.refreshToken,
            device_id: deviceProfile.deviceId
          })
        });

        const refreshed = await parseJsonResponse<{ accessToken: string; refreshToken: string }>(refreshResponse);
        const nextSession = {
          ...activeSession,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken
        };

        setSession(nextSession);
        await secureSet(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
        sessionRef.current = nextSession;

        return apiFetch<T>(path, init, false);
      }

      return parseJsonResponse<T>(response);
    },
    [backendOrigin, deviceProfile]
  );

  const upsertKnownUsers = useCallback((entries: KnownChatUser[]) => {
    if (entries.length === 0) {
      return;
    }

    setKnownChatUsers((current) => {
      const next = { ...current };

      entries.forEach((entry) => {
        next[entry.username] = entry;
        if (entry.id) {
          next[entry.id] = entry;
        }
      });

      return next;
    });
  }, []);

  const upsertConversationSeed = useCallback((seed: ConversationSeed) => {
    setStoredThreads((current) => {
      const existingIndex = current.findIndex((entry) => entry.conversationKey === seed.conversationKey);
      if (existingIndex === -1) {
        return [seed, ...current];
      }

      const nextSeed = {
        ...current[existingIndex],
        ...seed
      };
      const withoutExisting = current.filter((entry) => entry.conversationKey !== seed.conversationKey);

      return [nextSeed, ...withoutExisting];
    });
  }, []);

  const appendCallTimelineMessage = useCallback((conversationKey: string, text: string) => {
    const createdAt = new Date().toISOString();
    setChatMessages((current) =>
      [
        ...current,
        {
          id: `call-${createUuid()}`,
          conversationKey,
          from: 'them' as 'them',
          text,
          time: formatClockTime(createdAt),
          createdAt,
          reactions: [],
          status: 'received' as 'received'
        }
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    );
  }, []);

  const teardownCallMedia = useCallback(() => {
    peerConnectionRef.current?.close?.();
    peerConnectionRef.current = null;
    peerConnectionCallIdRef.current = null;
    pendingIceCandidatesRef.current.clear();
    stopMobileMediaStream(localCallStreamRef.current);
    stopMobileMediaStream(remoteCallStreamRef.current);
    localCallStreamRef.current = null;
    remoteCallStreamRef.current = null;
    setLocalCallStreamUrl(null);
    setRemoteCallStreamUrl(null);
  }, []);

  const queueIceCandidate = useCallback((callId: string, candidate: RTCIceCandidateInit) => {
    const queued = pendingIceCandidatesRef.current.get(callId) ?? [];
    queued.push(candidate);
    pendingIceCandidatesRef.current.set(callId, queued);
  }, []);

  const flushQueuedIceCandidates = useCallback(async (callId: string, peer: any) => {
    const queued = pendingIceCandidatesRef.current.get(callId) ?? [];
    pendingIceCandidatesRef.current.delete(callId);

    for (const candidate of queued) {
      await addMobileIceCandidate(peer, candidate);
    }
  }, []);

  const fetchIceConfig = useCallback(async () => {
    try {
      const iceConfig = await apiFetch<MobileIceConfig>('/calls/ice-config');
      const nextIceServers = iceConfig.iceServers?.length ? iceConfig.iceServers : getMobileFallbackIceServers();
      setMobileRuntimeIceServers(nextIceServers);
      return nextIceServers;
    } catch {
      const fallback = getMobileFallbackIceServers();
      setMobileRuntimeIceServers(fallback);
      return fallback;
    }
  }, [apiFetch]);

  const prepareLocalCallMedia = useCallback(
    async (mode: MobileCallMode, muted: boolean, cameraEnabled: boolean) => {
      let stream = localCallStreamRef.current;
      const hasVideo = stream?.getVideoTracks?.().length ?? 0;
      const needsVideo = mode === 'video';

      if (!stream || (needsVideo && hasVideo === 0)) {
        stopMobileMediaStream(stream);
        stream = await requestMobileCallMedia(mode);
        localCallStreamRef.current = stream;
        setLocalCallStreamUrl(stream.toURL());
      }

      setMobileMicrophoneMuted(stream, muted);
      if (mode === 'video') {
        setMobileCameraEnabled(stream, cameraEnabled);
      }

      return stream;
    },
    []
  );

  const ensurePeerConnection = useCallback(
    async (callId: string, remoteSessionId: string, localStream: any) => {
      if (
        peerConnectionRef.current &&
        peerConnectionCallIdRef.current === callId &&
        peerConnectionRef.current.connectionState !== 'closed' &&
        peerConnectionRef.current.connectionState !== 'failed'
      ) {
        return peerConnectionRef.current;
      }

      teardownCallMedia();
      await fetchIceConfig();

      const peer = createMobileCallPeerConnection({
        localStream,
        onIceCandidate: (candidate) => {
          relayHandleRef.current?.send({
            type: 'call_signal',
            callId,
            targetSessionId: remoteSessionId,
            signal: {
              type: 'ice-candidate',
              candidate
            }
          });
        },
        onRemoteStream: (stream) => {
          remoteCallStreamRef.current = stream;
          setRemoteCallStreamUrl(stream.toURL());
        },
        onConnectionStateChange: (state) => {
          setCurrentCall((current) =>
            current && current.callId === callId
              ? {
                  ...current,
                  phase: state === 'connected' ? 'connected' : current.phase,
                  status:
                    state === 'connected'
                      ? current.mode === 'video'
                        ? 'Encrypted video call live.'
                        : 'Encrypted audio call live.'
                      : state === 'connecting'
                        ? 'Joining encrypted call...'
                        : state === 'disconnected' || state === 'failed'
                          ? 'Reconnecting secure media...'
                          : current.status,
                  connectedAt: state === 'connected' ? current.connectedAt ?? new Date().toISOString() : current.connectedAt
                }
              : current
          );
        }
      });

      peerConnectionRef.current = peer;
      peerConnectionCallIdRef.current = callId;
      return peer;
    },
    [fetchIceConfig, teardownCallMedia]
  );

  const ingestSignalMessages = useCallback(
    (incoming: MobileSignalMessage[], options: { markUnread: boolean }) => {
      if (incoming.length === 0) {
        return;
      }

      const nextThreads = new Map<string, ConversationSeed>();

      incoming.forEach((entry) => {
        const knownUser =
          knownUsersRef.current[entry.conversationKey] ??
          Object.values(knownUsersRef.current).find((candidate) => candidate.username === entry.conversationKey);

        const fallbackUsername = entry.conversationKey;
        const nextUser: KnownChatUser =
          knownUser ?? {
            id: undefined,
            username: fallbackUsername,
            displayName: fallbackUsername,
            avatar: fallbackAvatar(fallbackUsername),
            tier: pickTier(computeHash(fallbackUsername)),
            mood: pickMood(computeHash(fallbackUsername)),
            online: false,
            handle: `@${fallbackUsername}`
          };

        const existingThread = storedThreads.find((thread) => thread.conversationKey === entry.conversationKey);
        const thread = nextThreads.get(entry.conversationKey) ?? {
          id: existingThread?.id ?? `seed-${nextUser.id ?? entry.conversationKey}`,
          conversationKey: entry.conversationKey,
          recipientLookup: entry.conversationKey,
          userId: nextUser.id,
          user: {
            name: nextUser.displayName,
            handle: nextUser.handle,
            avatar: nextUser.avatar,
            tier: nextUser.tier,
            online: nextUser.online,
            mood: nextUser.mood
          },
          lastMessage: entry.text,
          time: formatTimeAgo(entry.createdAt),
          unread: existingThread?.unread ?? 0,
          pinned: existingThread?.pinned ?? false
        };

        thread.lastMessage = entry.text;
        thread.time = formatTimeAgo(entry.createdAt);
        if (options.markUnread && entry.direction === 'incoming') {
          thread.unread += 1;
        }
        nextThreads.set(entry.conversationKey, thread);

        upsertKnownUsers([nextUser]);
      });

      setChatMessages((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        const merged = [
          ...current,
          ...incoming
            .filter((entry) => !existingIds.has(entry.id))
            .map((entry) => ({
              id: entry.id,
              conversationKey: entry.conversationKey,
              from: (entry.direction === 'outgoing' ? 'me' : 'them') as 'me' | 'them',
              text: entry.text,
              time: formatClockTime(entry.createdAt),
              createdAt: entry.createdAt,
              reactions: [],
              remoteMessageId: entry.id,
              status: (entry.direction === 'outgoing' ? 'sent' : 'received') as 'sent' | 'received'
            }))
        ];

        return merged.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      });

      nextThreads.forEach((seed) => {
        upsertConversationSeed(seed);
      });
    },
    [storedThreads, upsertConversationSeed, upsertKnownUsers]
  );

  const ingestIncomingMessages = useCallback(
    (
      incoming: RelayDirectMessage[],
      options: {
        markSeen: boolean;
      }
    ) => {
      if (incoming.length === 0) {
        return [];
      }

      const nextKnownEntries: KnownChatUser[] = [];
      const incomingMessages: ChatMessageModel[] = [];
      const nextThreads = new Map<string, ConversationSeed>();
      const processedIds: string[] = [];

      incoming.forEach((entry) => {
        const knownUser =
          knownUsersRef.current[entry.senderUserId] ??
          Object.values(knownUsersRef.current).find((candidate) => candidate.id === entry.senderUserId);

        const fallbackUsername = knownUser?.username ?? entry.senderUserId;
        const nextUser: KnownChatUser =
          knownUser ?? {
            id: entry.senderUserId,
            username: fallbackUsername,
            displayName: fallbackUsername,
            avatar: fallbackAvatar(fallbackUsername),
            tier: pickTier(computeHash(fallbackUsername)),
            mood: pickMood(computeHash(fallbackUsername)),
            online: false,
            handle: `@${fallbackUsername}`
          };

        nextKnownEntries.push(nextUser);

        const conversationKey = nextUser.username;
        const createdAt = entry.clientCreatedAt || entry.serverReceivedAt;
        const existingThread = storedThreads.find((thread) => thread.conversationKey === conversationKey);
        const thread = nextThreads.get(conversationKey) ?? {
          id: existingThread?.id ?? `seed-${nextUser.id ?? conversationKey}`,
          conversationKey,
          recipientLookup: conversationKey,
          userId: nextUser.id,
          user: {
            name: nextUser.displayName,
            handle: nextUser.handle,
            avatar: nextUser.avatar,
            tier: nextUser.tier,
            online: nextUser.online,
            mood: nextUser.mood
          },
          lastMessage: entry.ciphertext,
          time: formatTimeAgo(createdAt),
          unread: existingThread?.unread ?? 0,
          pinned: existingThread?.pinned ?? false
        };

        thread.lastMessage = entry.ciphertext;
        thread.time = formatTimeAgo(createdAt);
        thread.unread += 1;
        nextThreads.set(conversationKey, thread);

        incomingMessages.push({
          id: `remote-${entry.messageId}`,
          conversationKey,
          from: 'them',
          text: entry.ciphertext,
          time: formatClockTime(createdAt),
          createdAt,
          reactions: [],
          remoteMessageId: entry.messageId,
          status: 'received'
        });

        processedIds.push(entry.messageId);
      });

      upsertKnownUsers(nextKnownEntries);

      setChatMessages((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        const merged = [...current, ...incomingMessages.filter((entry) => !existingIds.has(entry.id))];
        return merged.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      });

      nextThreads.forEach((seed) => {
        upsertConversationSeed(seed);
      });

      if (options.markSeen) {
        setSeenInboxMessageIds((current) => [...new Set([...current, ...processedIds])]);
      }

      return processedIds;
    },
    [storedThreads, upsertConversationSeed, upsertKnownUsers]
  );

  const applyCallMediaKey = useCallback((message: MobileSignalCallMediaKey) => {
    pendingCallMediaKeysRef.current.set(message.callId, message);
    setCurrentCall((current) => {
      if (!current || current.callId !== message.callId || current.mediaProvider !== 'livekit') {
        return current;
      }

      if (current.roomName && current.roomName !== message.roomName) {
        return current;
      }

      return {
        ...current,
        roomName: current.roomName ?? message.roomName,
        mediaEncryptionKey: message.mediaEncryptionKey,
        status:
          current.liveKitToken && current.phase !== 'ringing'
            ? 'Encrypted media key received. Joining secure call...'
            : current.status
      };
    });
  }, []);

  const refreshMobileInbox = useCallback(async () => {
    if (STABLE_STARTUP_MODE) {
      return;
    }

    if (!sessionRef.current || !deviceProfile) {
      return;
    }

    const { syncMobileDirectInbox } = await getMobileSignalModule();
    const signalMessages = (await syncMobileDirectInbox(
      requireBackendOrigin(backendOrigin),
      sessionRef.current,
      deviceProfile
    )) as MobileSignalEnvelope[];
    const unseen = signalMessages.filter((entry) => !seenInboxRef.current.has(entry.id));
    if (unseen.length === 0) {
      return;
    }

    const textMessages = unseen.filter((entry): entry is MobileSignalMessage => entry.kind === 'text');
    const callMediaKeys = unseen.filter((entry): entry is MobileSignalCallMediaKey => entry.kind === 'call_media_key');
    if (textMessages.length > 0) {
      ingestSignalMessages(textMessages, { markUnread: true });
    }
    callMediaKeys.forEach(applyCallMediaKey);
    setSeenInboxMessageIds((current) => [...new Set([...current, ...unseen.map((entry) => entry.id)])]);
  }, [applyCallMediaKey, backendOrigin, deviceProfile, ingestSignalMessages]);

  const loadSocialState = useCallback(async () => {
    if (!sessionRef.current) {
      return;
    }

    const [bootstrapResponse, profileResponse] = await Promise.all([
      apiFetch<SocialBootstrap>('/social/bootstrap'),
      apiFetch<SocialProfile>('/social/profile/me')
    ]);

    setBootstrap(bootstrapResponse);
    setProfile(profileResponse);

    const suggestions = Array.isArray(bootstrapResponse.suggestions) ? bootstrapResponse.suggestions : [];
    const stories = Array.isArray(bootstrapResponse.stories) ? bootstrapResponse.stories : [];

    const ownUsername = safeText(bootstrapResponse.me?.username, sessionRef.current?.user.username ?? 'kryno');
    const nextKnownUsers: KnownChatUser[] = [
      {
        id: bootstrapResponse.me?.userId ?? sessionRef.current?.user.id,
        username: ownUsername,
        displayName: safeText(bootstrapResponse.me?.displayName, ownUsername),
        avatar: fallbackAvatar(ownUsername, bootstrapResponse.me?.avatarUrl),
        tier: pickTier(computeHash(ownUsername)),
        mood: pickMood(computeHash(ownUsername)),
        online: true,
        handle: `@${ownUsername}`
      },
      ...suggestions
        .filter((entry) => !!entry?.username)
        .map((entry, index) => {
          const username = safeText(entry.username, `member-${index}`);
          return {
            id: entry.userId,
            username,
            displayName: safeText(entry.displayName, username),
            avatar: fallbackAvatar(username, entry.avatarUrl),
            tier: pickTier(computeHash(username) + index),
            mood: pickMood(computeHash(username) + index),
            online: index % 2 === 0,
            handle: `@${username}`
          };
        }),
      ...stories
        .filter((story) => !!story?.author?.username)
        .map((story, index) => {
          const username = safeText(story.author.username, `story-${index}`);
          return {
            id: undefined,
            username,
            displayName: safeText(story.author.displayName, username),
            avatar: fallbackAvatar(username, story.author.avatarUrl),
            tier: pickTier(computeHash(username) + index),
            mood: pickMood(computeHash(username) + index),
            online: false,
            handle: `@${username}`
          };
        })
    ];

    upsertKnownUsers(nextKnownUsers);
  }, [apiFetch]);

  const loadBillingState = useCallback(async () => {
    if (!sessionRef.current) {
      setBillingEntitlement(FREE_BILLING_ENTITLEMENT);
      return;
    }

    try {
      const entitlement = await apiFetch<BillingEntitlement>('/billing/me');
      setBillingEntitlement(entitlement);
    } catch {
      // Billing should never block the core app shell while staging DB migrations are catching up.
      setBillingEntitlement(FREE_BILLING_ENTITLEMENT);
    }
  }, [apiFetch]);

  const syncAuthenticatedState = useCallback(async () => {
    if (!sessionRef.current || !deviceProfile) {
      return;
    }

    try {
      setRefreshing(true);
      setError('');
      await Promise.all([loadSocialState(), loadBillingState()]);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Signed in, but live sync is temporarily unavailable.');
    } finally {
      setRefreshing(false);
    }
  }, [backendOrigin, deviceProfile, loadBillingState, loadSocialState]);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        await migrateMobileStartupStorage();
        const [storedOrigin, storedSession, nextDeviceProfile, cachedMessages, cachedThreads, cachedUsers, cachedSeenInbox] = await Promise.all([
          AsyncStorage.getItem(BACKEND_ORIGIN_STORAGE_KEY),
          secureGet(SESSION_STORAGE_KEY),
          loadDeviceProfile(),
          loadStoredJson<ChatMessageModel[]>(MOBILE_CHAT_MESSAGES_STORAGE_KEY, []),
          loadStoredJson<ConversationSeed[]>(MOBILE_CHAT_THREADS_STORAGE_KEY, []),
          loadStoredJson<Record<string, KnownChatUser>>(MOBILE_CHAT_KNOWN_USERS_STORAGE_KEY, {}),
          loadStoredJson<string[]>(MOBILE_CHAT_SEEN_INBOX_STORAGE_KEY, [])
        ]);

        if (!mounted) {
          return;
        }

        if (BUILD_LOCKED_BACKEND_ORIGIN) {
          setBackendOriginState(BUILD_LOCKED_BACKEND_ORIGIN);
          await AsyncStorage.removeItem(BACKEND_ORIGIN_STORAGE_KEY);
        } else if (storedOrigin?.trim()) {
          setBackendOriginState(storedOrigin.trim().replace(/\/+$/, ''));
        }

        setDeviceProfile(nextDeviceProfile);
        const safeMessages = asArray<ChatMessageModel>(cachedMessages);
        const safeThreads = asArray<ConversationSeed>(cachedThreads);
        const safeUsers = asRecord<KnownChatUser>(cachedUsers);
        const safeSeenInbox = asArray<string>(cachedSeenInbox);
        setChatMessages(safeMessages);
        setStoredThreads(safeThreads);
        setKnownChatUsers(safeUsers);
        knownUsersRef.current = safeUsers;
        setSeenInboxMessageIds(safeSeenInbox);
        seenInboxRef.current = new Set(safeSeenInbox);

        if (storedSession) {
          const parsedSession = JSON.parse(storedSession) as AuthSession;
          setSession(parsedSession);
          sessionRef.current = parsedSession;
        }
      } catch (hydrateError) {
        if (mounted) {
          setError(hydrateError instanceof Error ? hydrateError.message : 'Unable to start Kryno mobile.');
        }
      } finally {
        if (mounted) {
          setInitialized(true);
          setLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    void AsyncStorage.setItem(MOBILE_CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(chatMessages));
  }, [chatMessages, initialized]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    void AsyncStorage.setItem(MOBILE_CHAT_THREADS_STORAGE_KEY, JSON.stringify(storedThreads));
  }, [storedThreads, initialized]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    knownUsersRef.current = knownChatUsers;
    void AsyncStorage.setItem(MOBILE_CHAT_KNOWN_USERS_STORAGE_KEY, JSON.stringify(knownChatUsers));
  }, [knownChatUsers, initialized]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    seenInboxRef.current = new Set(seenInboxMessageIds);
    void AsyncStorage.setItem(MOBILE_CHAT_SEEN_INBOX_STORAGE_KEY, JSON.stringify(seenInboxMessageIds));
  }, [seenInboxMessageIds, initialized]);

  useEffect(() => {
    if (!initialized || !session || !deviceProfile) {
      return;
    }

    void syncAuthenticatedState();
  }, [deviceProfile, initialized, session, syncAuthenticatedState]);

  useEffect(() => {
    if (STABLE_STARTUP_MODE) {
      return;
    }

    if (!initialized || !session || !deviceProfile) {
      return;
    }

    void refreshMobileInbox().catch((inboxError) => {
      setError(inboxError instanceof Error ? inboxError.message : 'Secure inbox sync is temporarily unavailable.');
    });

    const intervalId = setInterval(() => {
      void refreshMobileInbox().catch((inboxError) => {
        setError(inboxError instanceof Error ? inboxError.message : 'Secure inbox sync is temporarily unavailable.');
      });
    }, 12000);

    return () => {
      clearInterval(intervalId);
    };
  }, [deviceProfile, initialized, refreshMobileInbox, session]);

  useEffect(() => {
    if (STABLE_STARTUP_MODE) {
      return;
    }

    if (!initialized || !session || !deviceProfile) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { connectMobileDirectRelay } = await getMobileSignalModule();
        if (cancelled) {
          return;
        }

        const relay = connectMobileDirectRelay(requireBackendOrigin(backendOrigin), session, deviceProfile, {
          onMessage: async (message) => {
            if (seenInboxRef.current.has(message.id)) {
              return;
            }
            if (message.kind === 'call_media_key') {
              applyCallMediaKey(message as MobileSignalCallMediaKey);
            } else {
              ingestSignalMessages([message as MobileSignalMessage], { markUnread: true });
            }
            setSeenInboxMessageIds((current) => [...new Set([...current, message.id])]);
          },
          onCallEvent: async (event) => {
            await handleRelayCallEventRef.current?.(event);
          },
          onStatus: (status, detail) => {
            if (status === 'connected') {
              setError('');
              return;
            }

            if (status === 'error' && detail) {
              setError(detail);
            }
          }
        });

        relayHandleRef.current = relay;
      } catch (relayError) {
        if (!cancelled) {
          setError(relayError instanceof Error ? relayError.message : 'Secure relay is temporarily unavailable.');
        }
      }
    })();

    return () => {
      cancelled = true;
      relayHandleRef.current?.disconnect();
      relayHandleRef.current = null;
    };
  }, [applyCallMediaKey, backendOrigin, deviceProfile, ingestSignalMessages, initialized, session]);

  const setBackendOrigin = useCallback(async (value: string) => {
    if (BUILD_LOCKED_BACKEND_ORIGIN) {
      setBackendOriginState(BUILD_LOCKED_BACKEND_ORIGIN);
      await AsyncStorage.removeItem(BACKEND_ORIGIN_STORAGE_KEY);
      return;
    }

    const normalized = value.trim().replace(/\/+$/, '');
    setBackendOriginState(normalized);
    await AsyncStorage.setItem(BACKEND_ORIGIN_STORAGE_KEY, normalized);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      if (!deviceProfile) {
        throw new Error('Device profile is still preparing.');
      }

      setLoading(true);
      setError('');

      try {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        const response = await fetchWithTimeout(`${apiOrigin}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: identifier.trim(),
            password,
            device_id: deviceProfile.deviceId,
            device_name: deviceProfile.deviceName,
            device_public_key: buildDevicePublicKey(deviceProfile.deviceSeed)
          })
        });

        const nextSession = await parseJsonResponse<AuthSession>(response);
        setSession(nextSession);
        sessionRef.current = nextSession;
        await secureSet(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
        setLoading(false);
        void syncAuthenticatedState();
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
        throw loginError;
      } finally {
        setLoading(false);
      }
    },
    [backendOrigin, deviceProfile, syncAuthenticatedState]
  );

  const signup = useCallback(
    async (input: { username: string; email: string; password: string }) => {
      if (!deviceProfile) {
        throw new Error('Device profile is still preparing.');
      }

      setLoading(true);
      setError('');

      try {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        const response = await fetchWithTimeout(`${apiOrigin}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: input.username.trim(),
            email: input.email.trim().toLowerCase(),
            password: input.password,
            device_id: deviceProfile.deviceId,
            device_name: deviceProfile.deviceName,
            device_public_key: buildDevicePublicKey(deviceProfile.deviceSeed)
          })
        });

        const result = await parseJsonResponse<SignupResponse>(response);
        return {
          email: result.email,
          username: result.username,
          verificationEmailSent: result.verificationEmailSent,
          verificationCodePreview: result.verificationCodePreview
        };
      } catch (signupError) {
        setError(signupError instanceof Error ? signupError.message : 'Unable to create account.');
        throw signupError;
      } finally {
        setLoading(false);
      }
    },
    [backendOrigin, deviceProfile]
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      setLoading(true);
      setError('');

      try {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        const response = await fetchWithTimeout(`${apiOrigin}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            code: code.trim()
          })
        });

        await parseJsonResponse<VerificationResponse>(response);
      } catch (verifyError) {
        setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify email.');
        throw verifyError;
      } finally {
        setLoading(false);
      }
    },
    [backendOrigin]
  );

  const resendVerification = useCallback(
    async (email: string) => {
      setLoading(true);
      setError('');

      try {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        const response = await fetchWithTimeout(`${apiOrigin}/api/auth/resend-verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase()
          })
        });

        const result = await parseJsonResponse<ResendVerificationResponse>(response);
        return {
          verificationEmailSent: result.verificationEmailSent,
          verificationCodePreview: result.verificationCodePreview
        };
      } catch (resendError) {
        setError(resendError instanceof Error ? resendError.message : 'Unable to resend verification code.');
        throw resendError;
      } finally {
        setLoading(false);
      }
    },
    [backendOrigin]
  );

  const requestPasswordReset = useCallback(
    async (email: string) => {
      setLoading(true);
      setError('');

      try {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        const response = await fetchWithTimeout(`${apiOrigin}/api/auth/request-password-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase()
          })
        });

        const result = await parseJsonResponse<PasswordResetRequestResponse>(response);
        return {
          resetEmailSent: result.resetEmailSent,
          resetCodePreview: result.resetCodePreview
        };
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to send password reset code.');
        throw requestError;
      } finally {
        setLoading(false);
      }
    },
    [backendOrigin]
  );

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      setLoading(true);
      setError('');

      try {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        const response = await fetchWithTimeout(`${apiOrigin}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            code: code.trim(),
            new_password: newPassword
          })
        });

        await parseJsonResponse<PasswordResetResponse>(response);
      } catch (resetError) {
        setError(resetError instanceof Error ? resetError.message : 'Unable to reset password.');
        throw resetError;
      } finally {
        setLoading(false);
      }
    },
    [backendOrigin]
  );

  const logout = useCallback(async () => {
    const currentSession = sessionRef.current;

    try {
      if (currentSession) {
        const apiOrigin = requireBackendOrigin(backendOrigin);
        await fetchWithTimeout(`${apiOrigin}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: currentSession.refreshToken })
        }).catch(() => undefined);
      }
    } finally {
      relayHandleRef.current?.disconnect();
      relayHandleRef.current = null;
      teardownCallMedia();
      setCurrentCall(null);
      setSession(null);
      sessionRef.current = null;
      setBootstrap(null);
      setProfile(null);
      setBillingEntitlement(FREE_BILLING_ENTITLEMENT);
      await secureDelete(SESSION_STORAGE_KEY);
    }
  }, [backendOrigin, teardownCallMedia]);

  const refreshSocial = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      await Promise.all([loadSocialState(), loadBillingState()]);
      await refreshMobileInbox();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh data.');
    } finally {
      setRefreshing(false);
    }
  }, [backendOrigin, deviceProfile, loadBillingState, loadSocialState, refreshMobileInbox]);

  const refreshBilling = useCallback(async () => {
    await loadBillingState();
  }, [loadBillingState]);

  const createLiveKitCallToken = useCallback(
    async (input: { mode: MobileCallMode; recipientLookup?: string; roomName?: string }) =>
      apiFetch<LiveKitCallToken>('/calls/livekit-token', {
        method: 'POST',
        body: JSON.stringify({
          mode: input.mode,
          recipient_lookup: input.recipientLookup,
          room_name: input.roomName
        })
      }),
    [apiFetch]
  );

  const startOutgoingOffer = useCallback(
    async (callId: string, peerSessionId: string) => {
      const activeCall = currentCallRef.current;
      if (!activeCall) {
        return;
      }

      if (activeCall.mediaProvider === 'livekit') {
        return;
      }

      const localStream = await prepareLocalCallMedia(activeCall.mode, activeCall.muted, activeCall.cameraEnabled);
      const peer = await ensurePeerConnection(callId, peerSessionId, localStream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      relayHandleRef.current?.send({
        type: 'call_signal',
        callId,
        targetSessionId: peerSessionId,
        signal: {
          type: 'offer',
          sdp: offer.sdp ?? ''
        }
      });
    },
    [ensurePeerConnection, prepareLocalCallMedia]
  );

  const finishCurrentCall = useCallback(
    (summary: string) => {
      const activeCall = currentCallRef.current;
      if (activeCall) {
        appendCallTimelineMessage(activeCall.conversationKey, summary);
      }
      teardownCallMedia();
      setCurrentCall(null);
    },
    [appendCallTimelineMessage, teardownCallMedia]
  );

  const handleRelayCallEvent = useCallback(
    async (event: any) => {
      switch (event.type) {
        case 'call_invite': {
          const conversationKey = event.callerUsername;
          const mediaProvider = event.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
          const roomName = typeof event.roomName === 'string' ? event.roomName : null;
          const pendingMediaKey = pendingCallMediaKeysRef.current.get(event.callId);
          const mediaEncryptionKey =
            pendingMediaKey && (!roomName || pendingMediaKey.roomName === roomName)
              ? pendingMediaKey.mediaEncryptionKey
              : null;
          const knownUser =
            knownUsersRef.current[event.callerUsername] ??
            Object.values(knownUsersRef.current).find((entry) => entry.username === event.callerUsername);

          if (knownUser) {
            upsertConversationSeed({
              id: `seed-${knownUser.id ?? conversationKey}`,
              conversationKey,
              recipientLookup: conversationKey,
              userId: knownUser.id,
              user: {
                name: knownUser.displayName,
                handle: knownUser.handle,
                avatar: knownUser.avatar,
                tier: knownUser.tier,
                online: knownUser.online,
                mood: knownUser.mood
              },
              lastMessage: `${event.mode === 'video' ? 'Video' : 'Audio'} call incoming`,
              time: 'now',
              unread: 1,
              pinned: false
            });
          }

          setCurrentCall({
            callId: event.callId,
            conversationKey,
            direction: 'incoming',
            phase: 'ringing',
            mode: event.mode,
            mediaProvider,
            roomName,
            liveKitToken: null,
            mediaEncryptionKey,
            remoteLabel: knownUser?.displayName ?? event.callerUsername,
            remoteSessionId: event.callerSessionId,
            muted: false,
            cameraEnabled: event.mode === 'video',
            status:
              mediaProvider === 'livekit' && !mediaEncryptionKey
                ? 'Incoming call. Waiting for encrypted media key...'
                : event.mode === 'video'
                  ? 'Incoming encrypted video call'
                  : 'Incoming encrypted audio call',
            startedAt: new Date().toISOString()
          });
          break;
        }
        case 'call_ringing':
          setCurrentCall((current) =>
            current && current.callId === event.callId
              ? {
                  ...current,
                  phase: 'ringing',
                  mediaProvider: event.mediaProvider === 'livekit' ? 'livekit' : current.mediaProvider,
                  roomName: typeof event.roomName === 'string' ? event.roomName : current.roomName,
                  status: `Ringing ${event.recipientUsername}...`
                }
              : current
          );
          break;
        case 'call_unavailable':
          finishCurrentCall(`Call unavailable: ${event.reason}`);
          break;
        case 'call_rejected':
          finishCurrentCall(`Call declined: ${event.reason}`);
          break;
        case 'call_accepted': {
          const activeCall = currentCallRef.current;
          const mediaProvider =
            event.mediaProvider === 'livekit' || activeCall?.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
          const roomName = typeof event.roomName === 'string' ? event.roomName : activeCall?.roomName ?? null;

          if (mediaProvider === 'livekit') {
            if (!activeCall || !roomName) {
              finishCurrentCall('Call failed: secure room was missing');
              return;
            }

            try {
              const token = await createLiveKitCallToken({
                mode: activeCall.mode,
                recipientLookup: activeCall.conversationKey,
                roomName
              });
              setCurrentCall((current) =>
                current && current.callId === event.callId
                  ? {
                      ...current,
                      phase: 'connecting',
                      mediaProvider: 'livekit',
                      roomName,
                      liveKitToken: token,
                      remoteSessionId: event.peerSessionId,
                      status: current.mediaEncryptionKey
                        ? 'Joining managed encrypted media room...'
                        : 'Waiting for encrypted media key...'
                    }
                  : current
              );
            } catch (callTokenError) {
              finishCurrentCall(
                `Call failed: ${
                  callTokenError instanceof Error ? callTokenError.message : 'managed media token unavailable'
                }`
              );
            }
            return;
          }

          setCurrentCall((current) =>
            current && current.callId === event.callId
              ? {
                  ...current,
                  phase: 'connecting',
                  mediaProvider: 'webrtc',
                  remoteSessionId: event.peerSessionId,
                  status: 'Joining encrypted call...'
                }
              : current
          );
          await startOutgoingOffer(event.callId, event.peerSessionId);
          break;
        }
        case 'call_join': {
          const activeCall = currentCallRef.current;
          const mediaProvider =
            event.mediaProvider === 'livekit' || activeCall?.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
          const roomName = typeof event.roomName === 'string' ? event.roomName : activeCall?.roomName ?? null;

          if (mediaProvider === 'livekit' && activeCall && roomName && !activeCall.liveKitToken) {
            try {
              const token = await createLiveKitCallToken({
                mode: activeCall.mode,
                recipientLookup: activeCall.conversationKey,
                roomName
              });
              setCurrentCall((current) =>
                current && current.callId === event.callId
                  ? {
                      ...current,
                      phase: 'connecting',
                      mediaProvider: 'livekit',
                      roomName,
                      liveKitToken: token,
                      remoteSessionId: event.peerSessionId,
                      status: current.mediaEncryptionKey
                        ? 'Joining managed encrypted media room...'
                        : 'Waiting for encrypted media key...'
                    }
                  : current
              );
            } catch (callTokenError) {
              finishCurrentCall(
                `Call failed: ${
                  callTokenError instanceof Error ? callTokenError.message : 'managed media token unavailable'
                }`
              );
            }
            return;
          }

          setCurrentCall((current) =>
            current && current.callId === event.callId
              ? {
                  ...current,
                  phase: 'connecting',
                  mediaProvider,
                  roomName,
                  remoteSessionId: event.peerSessionId,
                  status:
                    mediaProvider === 'livekit'
                      ? current.mediaEncryptionKey
                        ? 'Joining managed encrypted media room...'
                        : 'Waiting for encrypted media key...'
                      : 'Waiting for secure media handshake...'
                }
              : current
          );
          break;
        }
        case 'call_signal': {
          const activeCall = currentCallRef.current;
          if (!activeCall || activeCall.callId !== event.callId) {
            return;
          }

          if (activeCall.mediaProvider === 'livekit') {
            return;
          }

          const remoteSessionId = activeCall.remoteSessionId ?? event.fromSessionId;
          const localStream = await prepareLocalCallMedia(activeCall.mode, activeCall.muted, activeCall.cameraEnabled);
          const peer = await ensurePeerConnection(event.callId, remoteSessionId, localStream);

          if (event.signal.type === 'offer') {
            const answer = await applyMobileOffer(peer, event.signal.sdp);
            await flushQueuedIceCandidates(event.callId, peer);
            relayHandleRef.current?.send({
              type: 'call_signal',
              callId: event.callId,
              targetSessionId: event.fromSessionId,
              signal: {
                type: 'answer',
                sdp: answer.sdp ?? ''
              }
            });
            return;
          }

          if (event.signal.type === 'answer') {
            await applyMobileAnswer(peer, event.signal.sdp);
            await flushQueuedIceCandidates(event.callId, peer);
            return;
          }

          const candidate = (event.signal as Extract<typeof event.signal, { type: 'ice-candidate' }>).candidate;
          if (peer.remoteDescription) {
            await addMobileIceCandidate(peer, candidate);
          } else {
            queueIceCandidate(event.callId, candidate);
          }
          return;
        }
        case 'call_ended':
          finishCurrentCall(`Call ended: ${event.reason.replaceAll('_', ' ')}`);
          break;
      }
    },
    [
      appendCallTimelineMessage,
      ensurePeerConnection,
      finishCurrentCall,
      flushQueuedIceCandidates,
      createLiveKitCallToken,
      prepareLocalCallMedia,
      queueIceCandidate,
      startOutgoingOffer,
      upsertConversationSeed
    ]
  );

  useEffect(() => {
    handleRelayCallEventRef.current = handleRelayCallEvent;
  }, [handleRelayCallEvent]);

  const startConversationCall = useCallback(
    async (conversation: Pick<ConversationSeed, 'conversationKey' | 'recipientLookup' | 'user'>, mode: MobileCallMode) => {
      if (STABLE_STARTUP_MODE) {
        throw new Error('Calls are disabled in this stable startup build while login stability is being verified.');
      }

      if (!sessionRef.current || !deviceProfile || !relayHandleRef.current) {
        throw new Error('Secure relay is not connected yet.');
      }

      const callId = createUuid();
      const roomName = createManagedCallRoomName(mode, callId);
      let mediaProvider: CallStateModel['mediaProvider'] = 'livekit';
      let liveKitToken: LiveKitCallToken | null = null;
      let mediaEncryptionKey: string | null = null;

      const signalModule = await getMobileSignalModule();
      mediaEncryptionKey = signalModule.createCallMediaEncryptionKey();

      try {
        liveKitToken = await createLiveKitCallToken({
          mode,
          recipientLookup: conversation.recipientLookup,
          roomName
        });
      } catch {
        mediaProvider = 'webrtc';
        mediaEncryptionKey = null;
        await fetchIceConfig();
        await prepareLocalCallMedia(mode, false, mode === 'video');
      }

      if (mediaProvider === 'livekit' && mediaEncryptionKey) {
        await signalModule.sendMobileDirectCallMediaKey(
          requireBackendOrigin(backendOrigin),
          sessionRef.current,
          deviceProfile,
          conversation.recipientLookup,
          {
            callId,
            mode,
            roomName,
            mediaEncryptionKey
          }
        );
      }

      setCurrentCall({
        callId,
        conversationKey: conversation.conversationKey,
        direction: 'outgoing',
        phase: 'ringing',
        mode,
        mediaProvider,
        roomName: mediaProvider === 'livekit' ? roomName : null,
        liveKitToken,
        mediaEncryptionKey,
        remoteLabel: conversation.user.name,
        remoteSessionId: null,
        muted: false,
        cameraEnabled: mode === 'video',
        status:
          mediaProvider === 'livekit'
            ? `Ringing ${conversation.user.name} through managed relay...`
            : `Ringing ${conversation.user.name}...`,
        startedAt: new Date().toISOString()
      });

      const sent = relayHandleRef.current.send({
        type: 'call_invite',
        callId,
        recipientLookup: conversation.recipientLookup,
        mode,
        mediaProvider,
        roomName: mediaProvider === 'livekit' ? roomName : undefined
      });

      if (!sent) {
        throw new Error('Secure relay is not connected yet.');
      }
    },
    [backendOrigin, createLiveKitCallToken, deviceProfile, fetchIceConfig, prepareLocalCallMedia]
  );

  const acceptCurrentCall = useCallback(async () => {
    const activeCall = currentCallRef.current;
    if (!activeCall || !relayHandleRef.current) {
      return;
    }

    if (activeCall.mediaProvider === 'livekit') {
      if (!activeCall.roomName) {
        finishCurrentCall('Call failed: secure room was missing');
        return;
      }

      try {
        const token = await createLiveKitCallToken({
          mode: activeCall.mode,
          recipientLookup: activeCall.conversationKey,
          roomName: activeCall.roomName
        });

        setCurrentCall((current) =>
          current
            ? {
                ...current,
                phase: 'connecting',
                liveKitToken: token,
                status: current.mediaEncryptionKey
                  ? 'Joining managed encrypted media room...'
                  : 'Waiting for encrypted media key...'
              }
            : current
        );
      } catch (callTokenError) {
        finishCurrentCall(
          `Call failed: ${callTokenError instanceof Error ? callTokenError.message : 'managed media token unavailable'}`
        );
        return;
      }

      relayHandleRef.current.send({
        type: 'call_accept',
        callId: activeCall.callId
      });
      return;
    }

    await fetchIceConfig();
    await prepareLocalCallMedia(activeCall.mode, activeCall.muted, activeCall.cameraEnabled);
    relayHandleRef.current.send({
      type: 'call_accept',
      callId: activeCall.callId
    });
    setCurrentCall((current) =>
      current
        ? {
            ...current,
            phase: 'connecting',
            status: 'Joining encrypted call...'
          }
        : current
    );
  }, [createLiveKitCallToken, fetchIceConfig, finishCurrentCall, prepareLocalCallMedia]);

  const rejectCurrentCall = useCallback(async (reason = 'declined') => {
    const activeCall = currentCallRef.current;
    if (!activeCall) {
      return;
    }

    relayHandleRef.current?.send({
      type: 'call_reject',
      callId: activeCall.callId,
      reason
    });

    finishCurrentCall(`Call declined: ${reason}`);
  }, [finishCurrentCall]);

  const endCurrentCall = useCallback(async (reason = 'ended') => {
    const activeCall = currentCallRef.current;
    if (!activeCall) {
      return;
    }

    relayHandleRef.current?.send({
      type: 'call_end',
      callId: activeCall.callId,
      reason
    });

    finishCurrentCall(`Call ended: ${reason}`);
  }, [finishCurrentCall]);

  const toggleCurrentCallMute = useCallback(() => {
    setCurrentCall((current) => {
      if (!current) {
        return current;
      }

      const nextMuted = !current.muted;
      setMobileMicrophoneMuted(localCallStreamRef.current, nextMuted);
      return {
        ...current,
        muted: nextMuted
      };
    });
  }, []);

  const toggleCurrentCallCamera = useCallback(() => {
    setCurrentCall((current) => {
      if (!current || current.mode !== 'video') {
        return current;
      }

      const nextEnabled = !current.cameraEnabled;
      setMobileCameraEnabled(localCallStreamRef.current, nextEnabled);
      return {
        ...current,
        cameraEnabled: nextEnabled
      };
    });
  }, []);

  const updateCurrentCallTransport = useCallback(
    (input: { phase?: CallStateModel['phase']; status: string; connectedAt?: string }) => {
      setCurrentCall((current) =>
        current
          ? {
              ...current,
              phase: input.phase ?? current.phase,
              status: input.status,
              connectedAt: input.connectedAt ?? current.connectedAt
            }
          : current
      );
    },
    []
  );

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        return [];
      }

      const result = await apiFetch<{ users: SearchUser[] }>(`/users/search?q=${encodeURIComponent(query.trim())}`);
      upsertKnownUsers(
        result.users.map((entry, index) => ({
          id: entry.id,
          username: entry.username,
          displayName: entry.display_name || entry.username,
          avatar: fallbackAvatar(entry.username, entry.avatar_url),
          tier: pickTier(computeHash(entry.username) + index),
          mood: pickMood(computeHash(entry.username) + index),
          online: false,
          handle: `@${entry.username}`
        }))
      );
      return result.users;
    },
    [apiFetch, upsertKnownUsers]
  );

  const ensureConversationForUser = useCallback(
    (user: SearchUser) => {
      const seedValue = computeHash(user.username);
      const knownUser: KnownChatUser = {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        avatar: fallbackAvatar(user.username, user.avatar_url),
        tier: pickTier(seedValue),
        mood: pickMood(seedValue),
        online: false,
        handle: `@${user.username}`
      };

      upsertKnownUsers([knownUser]);

      const existing = storedThreads.find((entry) => entry.conversationKey === user.username);
      const conversation: ConversationSeed = existing ?? {
        id: `seed-${user.id || user.username}`,
        conversationKey: user.username,
        recipientLookup: user.username,
        userId: user.id,
        user: {
          name: knownUser.displayName,
          handle: knownUser.handle,
          avatar: knownUser.avatar,
          tier: knownUser.tier,
          online: knownUser.online,
          mood: knownUser.mood
        },
        lastMessage: 'Start a private Kryno conversation.',
        time: 'now',
        unread: 0,
        pinned: false
      };

      upsertConversationSeed(conversation);
      return conversation;
    },
    [storedThreads, upsertConversationSeed, upsertKnownUsers]
  );

  const getSocialProfile = useCallback(
    async (username: string) =>
      apiFetch<SocialProfile>(`/social/profile/${encodeURIComponent(username.replace(/^@/, '').trim())}`),
    [apiFetch]
  );

  const markConversationRead = useCallback((conversationKey: string) => {
    setStoredThreads((current) =>
      current.map((entry) =>
        entry.conversationKey === conversationKey
          ? {
              ...entry,
              unread: 0
            }
          : entry
      )
    );
  }, []);

  const togglePostLike = useCallback(
    async (postId: string) => {
      const post = bootstrap?.feed.find((entry) => entry.id === postId);
      if (!post) {
        return;
      }

      const method = post.likedByMe ? 'DELETE' : 'POST';
      const updated = await apiFetch<SocialPost>(`/social/posts/${postId}/like`, { method });

      setBootstrap((current) =>
        current
          ? {
              ...current,
              feed: current.feed.map((entry) => (entry.id === postId ? updated : entry))
            }
          : current
      );
    },
    [apiFetch, bootstrap]
  );

  const commentOnPost = useCallback(
    async (postId: string, body: string) => {
      const updated = await apiFetch<SocialPost>(`/social/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim() })
      });

      setBootstrap((current) =>
        current
          ? {
              ...current,
              feed: current.feed.map((entry) => (entry.id === postId ? updated : entry))
            }
          : current
      );
    },
    [apiFetch]
  );

  const deletePost = useCallback(
    async (postId: string) => {
      await apiFetch<{ success: boolean; postId: string }>(`/social/posts/${postId}`, { method: 'DELETE' });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              feed: current.feed.filter((entry) => entry.id !== postId)
            }
          : current
      );
    },
    [apiFetch]
  );

  const toggleFollow = useCallback(
    async (username: string, isFollowing: boolean) => {
      const method = isFollowing ? 'DELETE' : 'POST';
      const updated = await apiFetch<SocialProfile>(`/social/follow/${encodeURIComponent(username)}`, { method });

      setBootstrap((current) =>
        current
          ? {
              ...current,
              suggestions: current.suggestions.map((entry) =>
                entry.username === username ? updated : entry
              )
            }
          : current
      );

      if (profile?.username === username) {
        setProfile(updated);
      }
    },
    [apiFetch, profile]
  );

  const saveProfile = useCallback(
    async (input: { displayName: string; bio: string }) => {
      const updated = await apiFetch<SocialProfile>('/social/profile/me', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: input.displayName.trim(),
          bio: input.bio.trim()
        })
      });

      setProfile(updated);
      setBootstrap((current) =>
        current
          ? {
              ...current,
              me: updated
            }
          : current
      );
    },
    [apiFetch]
  );

  const uploadSocialMedia = useCallback(
    async (
      kind: 'avatar' | 'post' | 'story',
      input: MediaUploadInput
    ) => {
      const sniffedMimeType = sniffBase64MediaMimeType(input.bytesBase64);
      const mimeType = sniffedMimeType || guessMimeType(input.uri, input.mimeType);
      const fileName = ensureFileNameMatchesMimeType(guessFileName(input.uri, input.fileName, mimeType), mimeType);
      const uploadTimeoutMs = 120_000;
      const uploadJsonPayload = async (bytesBase64: string) => {
        const payload = bytesBase64.trim();
        if (!payload) {
          throw new Error('Could not read that media file from Android. Please choose another photo or video.');
        }

        return apiFetch<SocialMediaUpload>('/social/media', {
          method: 'POST',
          timeoutMs: uploadTimeoutMs,
          body: JSON.stringify({
            kind,
            fileName,
            mimeType,
            bytesBase64: payload
          })
        });
      };

      if (input.bytesBase64) {
        return uploadJsonPayload(input.bytesBase64);
      }

      const formData = new FormData();
      formData.append('kind', kind);
      formData.append('fileName', fileName);
      formData.append('mimeType', mimeType);
      formData.append('media', {
        uri: input.uri,
        name: fileName,
        type: mimeType
      } as any);

      try {
        return await apiFetch<SocialMediaUpload>('/social/media', {
          method: 'POST',
          timeoutMs: uploadTimeoutMs,
          body: formData as any
        });
      } catch (multipartError) {
        const bytesBase64 =
          input.bytesBase64 ??
          (await promiseWithTimeout(
            FileSystem.readAsStringAsync(input.uri, {
              encoding: FileSystem.EncodingType.Base64
            }),
            30_000,
            'Could not read that media file from Android. Please choose another photo or video.'
          ));

        try {
          return await uploadJsonPayload(bytesBase64);
        } catch (jsonError) {
          throw jsonError instanceof Error ? jsonError : multipartError;
        }
      }
    },
    [apiFetch]
  );

  const uploadProfilePhoto = useCallback(
    async (input: MediaUploadInput) => {
      const media = await uploadSocialMedia('avatar', input);
      const updated = await apiFetch<SocialProfile>('/social/profile/me', {
        method: 'PUT',
        body: JSON.stringify({
          avatarMediaId: media.assetId
        })
      });

      setProfile(updated);
      setBootstrap((current) =>
        current
          ? {
              ...current,
              me: updated
            }
          : current
      );
    },
    [apiFetch, uploadSocialMedia]
  );

  const createStoryFromMedia = useCallback(
    async (input: MediaUploadInput & { caption?: string }) => {
      const media = await uploadSocialMedia('story', input);
      await apiFetch<SocialStory>('/social/stories', {
        method: 'POST',
        body: JSON.stringify({
          caption: input.caption?.trim() ?? '',
          visibility: 'public',
          mediaAssetId: media.assetId
        })
      });
      await loadSocialState();
    },
    [apiFetch, loadSocialState, uploadSocialMedia]
  );

  const viewStory = useCallback(
    async (storyId: string) => {
      if (!storyId || storyId === 'add-story') {
        return;
      }

      const updated = await apiFetch<SocialStory | null>(`/social/stories/${encodeURIComponent(storyId)}/view`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (!updated) {
        return;
      }

      setBootstrap((current) =>
        current
          ? {
              ...current,
              stories: current.stories.map((story) => (story.id === updated.id ? updated : story))
            }
          : current
      );
    },
    [apiFetch]
  );

  const createPostFromMedia = useCallback(
    async (input: MediaUploadInput & { caption?: string }) => {
      const media = await uploadSocialMedia('post', input);
      await apiFetch<SocialPost>('/social/posts', {
        method: 'POST',
        body: JSON.stringify({
          caption: input.caption?.trim() ?? '',
          visibility: 'public',
          mediaAssetId: media.assetId
        })
      });
      await loadSocialState();
    },
    [apiFetch, loadSocialState, uploadSocialMedia]
  );

  const createTextPost = useCallback(
    async (input: { caption: string }) => {
      await apiFetch<SocialPost>('/social/posts', {
        method: 'POST',
        body: JSON.stringify({
          caption: input.caption.trim(),
          visibility: 'public'
        })
      });
      await loadSocialState();
    },
    [apiFetch, loadSocialState]
  );

  const feedPosts = useMemo<FeedPostModel[]>(() => {
    const source = Array.isArray(bootstrap?.feed) ? bootstrap.feed : [];
    if (source.length === 0) {
      return [];
    }

    return source.filter((post) => !!post?.id).map((post, index) => {
      const username = safeText(post.author?.username, `author-${index}`);
      const seed = computeHash(username) + index;
      return {
        id: post.id,
        username,
        user: {
          name: safeText(post.author?.displayName, username),
          handle: `@${username}`,
          avatar: fallbackAvatar(username, post.author?.avatarUrl),
          tier: pickTier(seed)
        },
        image: resolveMediaUrl(backendOrigin, post.mediaUrl, ''),
        caption: post.caption || 'Shared a private Kryno moment.',
        captionKeywords: pickKeywords(post.caption || ''),
        timeAgo: formatTimeAgo(post.createdAt),
        likes: Number(post.likeCount ?? 0),
        comments: Number(post.commentCount ?? 0),
        locked: post.visibility === 'private_circle',
        mood: pickMood(seed),
        likedByMe: Boolean(post.likedByMe),
        mediaKind: post.mediaKind,
        commentItems: Array.isArray(post.comments) ? post.comments : []
      };
    });
  }, [backendOrigin, bootstrap]);

  const currentUser = useMemo<MeModel>(() => {
    const source = profile ?? bootstrap?.me;
    const sessionUser = session?.user ?? sessionRef.current?.user ?? null;
    const fallbackUsername = safeText(sessionUser?.username, sessionUser?.email?.split('@')[0] ?? 'kryno');
    const emptyUser = {
      ...ME,
      id: sessionUser?.id ?? ME.id,
      name: fallbackUsername,
      handle: `@${fallbackUsername}`,
      avatar: fallbackAvatar(fallbackUsername),
      bio: '',
      bioKeywords: [],
      tier: 'Basic' as const,
      joinDate: 'Today',
      status: 'active' as const,
      mood: 'chill' as const,
      interests: [],
      identityTags: [],
      stats: { posts: 0, followers: 0, following: 0, visits: 0 },
      music: { title: '', artist: '', progress: 0, duration: '' }
    };

    if (!source) {
      return emptyUser;
    }

    const username = safeText(source.username, fallbackUsername);
    const ownPostsCount = (Array.isArray(bootstrap?.feed) ? bootstrap.feed : []).filter((post) => post.author?.username === username).length;
    const seed = computeHash(username);

    return {
      ...emptyUser,
      id: source.userId ?? sessionUser?.id ?? ME.id,
      name: safeText(source.displayName, username),
      handle: `@${username}`,
      avatar: fallbackAvatar(username, source.avatarUrl),
      bio: source.bio || '',
      bioKeywords: pickKeywords(source.bio || ''),
      tier: pickTier(seed),
      status: 'active',
      mood: pickMood(seed),
      stats: {
        posts: ownPostsCount,
        followers: Number(source.followersCount ?? 0),
        following: Number(source.followingCount ?? 0),
        visits: 0
      }
    };
  }, [bootstrap, profile, session]);

  const stories = useMemo<StoryModel[]>(() => {
    const liveStories = Array.isArray(bootstrap?.stories) ? bootstrap.stories : [];
    if (liveStories.length === 0) {
      return STORIES[0] ? [STORIES[0]] : [];
    }

    return [
      STORIES[0],
      ...liveStories
        .filter((story) => !!story?.id && !!story?.author?.username)
        .slice(0, 8)
        .map((story, index) => {
          const username = safeText(story.author.username, `story-${index}`);
          const displayName = safeText(story.author.displayName, username);
          return {
            id: story.id,
            label: displayName.split(/\s+/)[0] || username,
            isAdd: false,
            gradient: STORIES[(index % (STORIES.length - 1)) + 1]?.gradient ?? ['#6366F1', '#8B5CF6'],
            avatar: fallbackAvatar(username, story.author.avatarUrl),
            username,
            mediaUrl: resolveMediaUrl(backendOrigin, story.mediaUrl, ''),
            mediaMimeType: story.mediaMimeType,
            caption: story.caption || '',
            viewedByMe: Boolean(story.viewedByMe),
            viewCount: Number(story.viewCount ?? 0),
            expiresAt: story.expiresAt,
            createdAt: story.createdAt
          };
        })
    ];
  }, [backendOrigin, bootstrap]);

  const featuredMembers = useMemo<FeaturedMemberModel[]>(() => {
    const liveSuggestions = Array.isArray(bootstrap?.suggestions) ? bootstrap.suggestions : [];
    if (liveSuggestions.length === 0) {
      return [];
    }

    return liveSuggestions.filter((member) => !!member?.username).map((member, index) => {
      const username = safeText(member.username, `member-${index}`);
      const seed = computeHash(username) + index;
      return {
        id: member.userId ?? `member-${index}`,
        name: safeText(member.displayName, username),
        handle: `@${username}`,
        tier: pickTier(seed),
        avatar: fallbackAvatar(username, member.avatarUrl),
        mood: pickMood(seed),
        online: index % 2 === 0,
        isFollowing: Boolean(member.isFollowing)
      };
    });
  }, [bootstrap]);

  const discoverPosts = useMemo(() => {
    const feed = Array.isArray(bootstrap?.feed) ? bootstrap.feed : [];
    if (!feed.length) {
      return [];
    }

    return feed
      .filter((post) => post.mediaUrl)
      .slice(0, 8)
        .map((post, index) => ({
        id: post.id,
        image: resolveMediaUrl(backendOrigin, post.mediaUrl, ''),
        category: DISCOVER_CATEGORIES[(index % (DISCOVER_CATEGORIES.length - 1)) + 1]?.id ?? 'all',
        tall: index % 3 === 0,
        likes: Number(post.likeCount ?? 0)
      }));
  }, [backendOrigin, bootstrap]);

  const profilePosts = useMemo<ProfilePostModel[]>(() => {
    const ownPosts = (Array.isArray(bootstrap?.feed) ? bootstrap.feed : []).filter(
      (post) => post.author?.username === currentUser.handle.replace(/^@/, '') && post.mediaUrl
    );
    if (ownPosts.length === 0) {
      return [];
    }

    return ownPosts.map((post, index) => ({
      id: post.id,
      image: resolveMediaUrl(backendOrigin, post.mediaUrl, ''),
      locked: post.visibility === 'private_circle',
      likes: Number(post.likeCount ?? 0),
      comments: Number(post.commentCount ?? 0),
      tall: index % 2 === 0
    }));
  }, [backendOrigin, bootstrap, currentUser.handle]);

  const getConversationMessages = useCallback(
    (conversationKey: string) =>
      chatMessages
        .filter((entry) => entry.conversationKey === conversationKey)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [chatMessages]
  );

  const sendConversationMessage = useCallback(
    async (conversation: Pick<ConversationSeed, 'conversationKey' | 'recipientLookup' | 'user'>, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !sessionRef.current || !deviceProfile) {
        return;
      }

      if (STABLE_STARTUP_MODE) {
        const createdAt = new Date().toISOString();
        setChatMessages((current) =>
          [
            ...current,
            {
              id: `local-${createUuid()}`,
              conversationKey: conversation.conversationKey,
              from: 'me' as 'me',
              text: trimmed,
              time: formatClockTime(createdAt),
              createdAt,
              reactions: [],
              status: 'failed' as 'failed'
            }
          ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        );
        throw new Error('Secure chat is disabled in this stable startup build while login stability is being verified.');
      }

      try {
        const { sendMobileDirectText } = await getMobileSignalModule();
        const secureMessage = await sendMobileDirectText(
          requireBackendOrigin(backendOrigin),
          sessionRef.current,
          deviceProfile,
          conversation.recipientLookup,
          trimmed
        );

        ingestSignalMessages([secureMessage], { markUnread: false });
      } catch (sendError) {
        throw sendError;
      }
    },
    [backendOrigin, deviceProfile, ingestSignalMessages]
  );

  const conversationSeeds = useMemo<ConversationSeed[]>(() => {
    const fromStored = storedThreads.map((thread) => {
      const knownUser =
        knownChatUsers[thread.conversationKey] ??
        Object.values(knownChatUsers).find((entry) => entry.username === thread.conversationKey) ??
        null;

      return {
        ...thread,
        userId: knownUser?.id ?? thread.userId,
        recipientLookup: thread.recipientLookup || thread.conversationKey,
        user: knownUser
          ? {
              name: knownUser.displayName,
              handle: knownUser.handle,
              avatar: knownUser.avatar,
              tier: knownUser.tier,
              online: knownUser.online,
              mood: knownUser.mood
            }
          : thread.user
      };
    });

    if (fromStored.length > 0) {
      return fromStored;
    }

    return featuredMembers.map((member, index) => ({
      id: `seed-${member.id}`,
      conversationKey: member.handle.replace(/^@/, ''),
      recipientLookup: member.handle.replace(/^@/, ''),
      userId: member.id,
      user: {
        name: member.name,
        handle: member.handle,
        avatar: member.avatar,
        tier: member.tier,
        online: member.online,
        mood: member.mood
      },
      lastMessage: member.isFollowing ? 'Secure chat ready.' : 'Start a private Kryno conversation.',
      time: index === 0 ? 'now' : `${index + 1}h`,
      unread: 0,
      pinned: index < 2
    }));
  }, [featuredMembers, knownChatUsers, storedThreads]);

  const value = useMemo<KrynoBackendContextValue>(
    () => ({
      initialized,
      loading,
      refreshing,
      error,
      backendOrigin,
      setBackendOrigin,
      session,
      login,
      signup,
      verifyEmail,
      resendVerification,
      requestPasswordReset,
      resetPassword,
      logout,
      refreshSocial,
      refreshBilling,
      billingEntitlement,
      currentUser,
      feedPosts,
      stories,
      featuredMembers,
      discoverPosts,
      discoverCategories: DISCOVER_CATEGORIES,
      profilePosts,
      conversationSeeds,
      getConversationMessages,
      sendConversationMessage,
      ensureConversationForUser,
      markConversationRead,
      currentCall,
      localCallStreamUrl,
      remoteCallStreamUrl,
      createLiveKitCallToken,
      startConversationCall,
      acceptCurrentCall,
      rejectCurrentCall,
      endCurrentCall,
      toggleCurrentCallMute,
      toggleCurrentCallCamera,
      updateCurrentCallTransport,
      searchUsers,
      getSocialProfile,
      togglePostLike,
      commentOnPost,
      deletePost,
      toggleFollow,
      saveProfile,
      uploadProfilePhoto,
      createPostFromMedia,
      createTextPost,
      createStoryFromMedia,
      viewStory
    }),
    [
      initialized,
      loading,
      refreshing,
      error,
      backendOrigin,
      setBackendOrigin,
      session,
      login,
      signup,
      verifyEmail,
      resendVerification,
      requestPasswordReset,
      resetPassword,
      logout,
      refreshSocial,
      refreshBilling,
      billingEntitlement,
      currentUser,
      feedPosts,
      stories,
      featuredMembers,
      discoverPosts,
      profilePosts,
      conversationSeeds,
      getConversationMessages,
      sendConversationMessage,
      ensureConversationForUser,
      markConversationRead,
      currentCall,
      localCallStreamUrl,
      remoteCallStreamUrl,
      createLiveKitCallToken,
      startConversationCall,
      acceptCurrentCall,
      rejectCurrentCall,
      endCurrentCall,
      toggleCurrentCallMute,
      toggleCurrentCallCamera,
      updateCurrentCallTransport,
      searchUsers,
      getSocialProfile,
      togglePostLike,
      commentOnPost,
      deletePost,
      toggleFollow,
      saveProfile,
      uploadProfilePhoto,
      createPostFromMedia,
      createTextPost,
      createStoryFromMedia,
      viewStory
    ]
  );

  return <KrynoBackendContext.Provider value={value}>{children}</KrynoBackendContext.Provider>;
}

export function useKrynoBackend() {
  const context = useContext(KrynoBackendContext);
  if (!context) {
    throw new Error('useKrynoBackend must be used inside KrynoBackendProvider.');
  }
  return context;
}
