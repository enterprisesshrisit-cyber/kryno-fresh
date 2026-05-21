import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ToneController,
  createCallPeerConnection,
  getFallbackIceServers,
  requestCallMedia,
  setCameraEnabled,
  setMicrophoneMuted,
  setRuntimeIceServers,
  stopMediaStream,
  type CallMode,
  type RuntimeIceConfig,
  type RelayCallEvent
} from './lib/callClient';
import {
  bootstrapSignalDevice,
  connectDirectRelay,
  downloadDirectAttachment,
  listConversationCallRecords,
  listConversationMessages,
  listConversationSummaries,
  resetDirectSignalState,
  saveConversationCallRecord,
  sendDirectAttachment,
  sendDirectText,
  syncDirectInbox
} from './lib/signalClient';
import {
  addPostComment,
  createPost,
  createStory,
  deletePost,
  fetchSocialBootstrap,
  followUser,
  likePost,
  markStoryViewed,
  resolveSocialMediaUrl,
  unlikePost,
  unfollowUser,
  updateMyProfile,
  uploadSocialMedia,
  type SocialBootstrap,
  type SocialPost,
  type SocialProfile,
  type SocialStory
} from './lib/socialClient';
import { clearBackendOrigin, getApiBase, getBackendOrigin, setBackendOrigin } from './lib/runtimeConfig';
import type { CallLogRecord, ConversationSummary, LocalMessageRecord } from './lib/signalStore';
import { KrynoMobileApp } from './krynoUi';

type AuthMode = 'signup' | 'verify' | 'login' | 'reset' | 'chat';

type SignupResponse = {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  verificationEmailSent?: boolean;
  verificationCodePreview?: string;
};

type LoginResponse = {
  user: {
    id: string;
    username: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
};

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

type SignupFormState = {
  username: string;
  email: string;
  password: string;
};

type LoginFormState = {
  identifier: string;
  password: string;
};

type ResetPasswordFormState = {
  email: string;
  code: string;
  newPassword: string;
};

type DeviceProfile = {
  deviceId: string;
  deviceName: string;
  deviceSeed: string;
};

type SearchUserResult = {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
};

type CallOverlayState = {
  callId: string;
  direction: 'incoming' | 'outgoing';
  phase: 'ringing' | 'connecting' | 'reconnecting' | 'connected';
  mode: CallMode;
  remoteLabel: string;
  remoteSessionId: string | null;
  muted: boolean;
  speakerMuted: boolean;
  cameraEnabled: boolean;
  ringtoneSilenced: boolean;
  status: string;
  startedAt: string;
  connectedAt?: string;
};

type AttachmentViewerState = {
  fileName: string;
  mimeType: string;
  objectUrl: string;
  sizeLabel: string;
  previewKind: 'image' | 'pdf' | 'document';
};

type BackendConnectionState = 'checking' | 'connected' | 'error';

type ProfileFormState = {
  displayName: string;
  bio: string;
  avatarFile: File | null;
};

type SocialComposerState = {
  caption: string;
  visibility: 'public' | 'followers';
  mediaFile: File | null;
};

type StoryComposerState = {
  caption: string;
  visibility: 'public' | 'followers' | 'private_circle';
  mediaFile: File | null;
};

const DEVICE_PROFILE_KEY = 'kryno_device_profile';
const AUTH_SESSION_KEY = 'kryno_auth_session';
const REQUEST_TIMEOUT_MS = 12_000;

function buildDevicePublicKey(seed: string) {
  const value = seed.trim() || crypto.randomUUID();
  return `kryno-device-pub-${btoa(value).replace(/=/g, '')}`;
}

function getDeviceProfile(): DeviceProfile {
  const stored = localStorage.getItem(DEVICE_PROFILE_KEY);
  if (stored) {
    return JSON.parse(stored) as DeviceProfile;
  }

  const profile = {
    deviceId: crypto.randomUUID(),
    deviceName: 'Kryno Web Test Device',
    deviceSeed: crypto.randomUUID()
  };

  localStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

async function postJson<T>(path: string, body: unknown) {
  let response: Response;
  const apiBase = getApiBase();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${getBackendOrigin()}. Make sure the backend is running and reachable from this device.`);
  } finally {
    window.clearTimeout(timeout);
  }

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    if ([502, 503, 504].includes(response.status)) {
      throw new Error(`Cannot reach the backend at ${getBackendOrigin()}. Make sure the backend is running and reachable from this device.`);
    }

    const fieldIssues =
      json?.issues && typeof json.issues === 'object' && json.issues.fieldErrors && typeof json.issues.fieldErrors === 'object'
        ? Object.values(json.issues.fieldErrors as Record<string, string[]>)
            .flat()
            .filter(Boolean)
            .join(' ')
        : '';

    throw new Error(
      typeof json?.message === 'string'
        ? json.message
        : typeof json?.error === 'string'
          ? json.error
          : fieldIssues
            ? fieldIssues
          : typeof json?.statusCode === 'number'
            ? `Request failed with status ${json.statusCode}.`
            : 'Request failed.'
    );
  }

  return json as T;
}

export default function App() {
  const deviceProfile = useMemo(() => getDeviceProfile(), []);
  const devicePublicKey = useMemo(() => buildDevicePublicKey(deviceProfile.deviceSeed), [deviceProfile.deviceSeed]);

  const [mode, setMode] = useState<AuthMode>('login');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [backendOriginInput, setBackendOriginInput] = useState(() => getBackendOrigin());
  const [backendConnectionState, setBackendConnectionState] = useState<BackendConnectionState>('checking');
  const [backendConnectionMessage, setBackendConnectionMessage] = useState('Checking backend reachability...');
  const [session, setSession] = useState<LoginResponse | null>(() => {
    const stored = localStorage.getItem(AUTH_SESSION_KEY);
    return stored ? (JSON.parse(stored) as LoginResponse) : null;
  });
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [signalReady, setSignalReady] = useState(false);
  const [relayStatus, setRelayStatus] = useState<'offline' | 'connecting' | 'connected' | 'error'>('offline');
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const [selectedConversation, setSelectedConversation] = useState('');
  const [recipientLookup, setRecipientLookup] = useState('');
  const [recipientResults, setRecipientResults] = useState<SearchUserResult[]>([]);
  const [recipientSearchBusy, setRecipientSearchBusy] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState<File | null>(null);
  const [attachmentViewer, setAttachmentViewer] = useState<AttachmentViewerState | null>(null);
  const [callInfraNotice, setCallInfraNotice] = useState('');
  const [messages, setMessages] = useState<LocalMessageRecord[]>([]);
  const [callHistory, setCallHistory] = useState<CallLogRecord[]>([]);
  const [callState, setCallState] = useState<CallOverlayState | null>(null);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const [socialBootstrap, setSocialBootstrap] = useState<SocialBootstrap | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    displayName: '',
    bio: '',
    avatarFile: null
  });
  const [postComposer, setPostComposer] = useState<SocialComposerState>({
    caption: '',
    visibility: 'public',
    mediaFile: null
  });
  const [storyComposer, setStoryComposer] = useState<StoryComposerState>({
    caption: '',
    visibility: 'public',
    mediaFile: null
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [storyBusy, setStoryBusy] = useState(false);
  const [followBusyUsers, setFollowBusyUsers] = useState<string[]>([]);
  const [socialCommentDrafts, setSocialCommentDrafts] = useState<Record<string, string>>({});
  const selectedConversationRef = useRef('');
  const allowAutoThreadOpenRef = useRef(true);
  const callStateRef = useRef<CallOverlayState | null>(null);
  const sessionRef = useRef<LoginResponse | null>(session);
  const refreshPromiseRef = useRef<Promise<LoginResponse> | null>(null);
  const relayHandleRef = useRef<ReturnType<typeof connectDirectRelay> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerConnectionCallIdRef = useRef<string | null>(null);
  const peerReconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const remoteCallStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const toneControllerRef = useRef<ToneController | null>(null);
  const callDisconnectTimerRef = useRef<number | null>(null);

  const [signup, setSignup] = useState<SignupFormState>({
    username: '',
    email: '',
    password: ''
  });

  const [login, setLogin] = useState<LoginFormState>({
    identifier: '',
    password: ''
  });

  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resetPasswordForm, setResetPasswordForm] = useState<ResetPasswordFormState>({
    email: '',
    code: '',
    newPassword: ''
  });
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [authLogoSrc, setAuthLogoSrc] = useState<string | null>(null);
  const activeConversationKey = selectedConversation.trim();

  const probeBackend = async (originOverride?: string) => {
    const origin = (originOverride ?? getBackendOrigin()).trim().replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setBackendConnectionState('checking');
    setBackendConnectionMessage(`Checking ${origin}...`);

    try {
      const response = await fetch(`${origin}/api/health`, {
        method: 'GET',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}.`);
      }

      setBackendConnectionState('connected');
      setBackendConnectionMessage(`Connected to ${origin}`);
      return true;
    } catch {
      setBackendConnectionState('error');
      setBackendConnectionMessage(`Cannot reach ${origin}. Make sure the laptop backend is running and reachable on this network.`);
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    localCallStreamRef.current = localCallStream;
  }, [localCallStream]);

  useEffect(() => {
    remoteCallStreamRef.current = remoteCallStream;
  }, [remoteCallStream]);

  useEffect(() => {
    toneControllerRef.current = new ToneController();

    return () => {
      toneControllerRef.current?.stop();
      toneControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attachmentViewer) {
        URL.revokeObjectURL(attachmentViewer.objectUrl);
      }
    };
  }, [attachmentViewer]);

  useEffect(() => {
    void probeBackend(backendOriginInput);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');

    if (modeParam === 'verify') {
      setMode('verify');
      setNotice('Finish verifying your email with the 6-digit code from your inbox.');
    } else if (modeParam === 'login' || modeParam === 'signup' || modeParam === 'chat') {
      setMode(modeParam);
    }
  }, []);

  useEffect(() => {
    if (mode === 'chat' || authLogoSrc) {
      return;
    }

    void import('./assets/kryno-brand-logo.png').then((module) => {
      setAuthLogoSrc(module.default);
    });
  }, [authLogoSrc, mode]);

  const resetSurface = () => {
    setError('');
    setNotice('');
  };

  const handleSaveBackendOrigin = async () => {
    const normalized = backendOriginInput.trim().replace(/\/+$/, '');
    if (!normalized) {
      setError('Enter a backend URL first.');
      return;
    }

    setBackendOrigin(normalized);
    setBackendOriginInput(normalized);
    const reachable = await probeBackend(normalized);
    if (reachable) {
      setNotice(`Backend updated to ${normalized}`);
      setError('');
      return;
    }

    setError(`Cannot reach ${normalized}.`);
  };

  const handleResetBackendOrigin = async () => {
    clearBackendOrigin();
    const fallback = getBackendOrigin();
    setBackendOriginInput(fallback);
    await probeBackend(fallback);
    setNotice(`Backend reset to ${fallback}`);
    setError('');
  };

  const persistSession = (nextSession: LoginResponse) => {
    setSession(nextSession);
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
  };

  const clearCallDisconnectTimer = () => {
    if (callDisconnectTimerRef.current !== null) {
      window.clearTimeout(callDisconnectTimerRef.current);
      callDisconnectTimerRef.current = null;
    }
  };

  const clearSessionState = (nextNotice?: string, options?: { resetSignalState?: boolean }) => {
    const activeSession = session;

    toneControllerRef.current?.stop();
    clearCallDisconnectTimer();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    peerConnectionCallIdRef.current = null;
    stopMediaStream(localCallStreamRef.current);
    stopMediaStream(remoteCallStreamRef.current);
    localCallStreamRef.current = null;
    remoteCallStreamRef.current = null;
    pendingIceCandidatesRef.current.clear();
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setCallState(null);
    setSession(null);
    setSignalReady(false);
    setRelayStatus('offline');
    setConversationSummaries([]);
    setSelectedConversation('');
    setRecipientLookup('');
    setRecipientResults([]);
    setMessages([]);
    setCallHistory([]);
    setSocialBootstrap(null);
    setSocialCommentDrafts({});
    setProfileForm({
      displayName: '',
      bio: '',
      avatarFile: null
    });
    setPostComposer({
      caption: '',
      visibility: 'public',
      mediaFile: null
    });
    setStoryComposer({
      caption: '',
      visibility: 'public',
      mediaFile: null
    });
    if (attachmentViewer) {
      URL.revokeObjectURL(attachmentViewer.objectUrl);
    }
    setAttachmentViewer(null);
    localStorage.removeItem(AUTH_SESSION_KEY);

    if (options?.resetSignalState && activeSession) {
      void resetDirectSignalState(activeSession, deviceProfile);
    }

    if (nextNotice) {
      setNotice(nextNotice);
    }
  };

  const teardownPeerConnection = () => {
    clearCallDisconnectTimer();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    peerConnectionCallIdRef.current = null;
    peerReconnectAttemptsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
  };

  const teardownCallMedia = () => {
    toneControllerRef.current?.stop();
    teardownPeerConnection();
    stopMediaStream(localCallStreamRef.current);
    stopMediaStream(remoteCallStreamRef.current);
    localCallStreamRef.current = null;
    remoteCallStreamRef.current = null;
    setLocalCallStream(null);
    setRemoteCallStream(null);
  };

  const finishLocalCall = async (nextNotice?: string, outcomeOverride?: CallLogRecord['outcome']) => {
    const activeCall = callStateRef.current;
    if (activeCall) {
      await persistCallRecord(activeCall, nextNotice ?? activeCall.status, outcomeOverride);
    }
    teardownCallMedia();
    setCallState(null);
    if (nextNotice) {
      setNotice(nextNotice);
    }
  };

  const queueIceCandidate = (callId: string, candidate: RTCIceCandidateInit) => {
    const current = pendingIceCandidatesRef.current.get(callId) ?? [];
    current.push(candidate);
    pendingIceCandidatesRef.current.set(callId, current);
  };

  const flushQueuedIceCandidates = async (callId: string, peer: RTCPeerConnection) => {
    const queued = pendingIceCandidatesRef.current.get(callId) ?? [];
    pendingIceCandidatesRef.current.delete(callId);

    for (const candidate of queued) {
      await peer.addIceCandidate(candidate);
    }
  };

  const scheduleCallDisconnectFallback = (callId: string, nextNotice: string) => {
    clearCallDisconnectTimer();
    callDisconnectTimerRef.current = window.setTimeout(() => {
      const liveCall = callStateRef.current;
      if (!liveCall || liveCall.callId !== callId) {
        return;
      }
      void finishLocalCall(nextNotice, 'failed');
    }, 45000);
  };

  const attemptPeerRecovery = (callId: string) => {
    const peer = peerConnectionRef.current;
    if (!peer || peerConnectionCallIdRef.current !== callId || peer.connectionState === 'closed') {
      return false;
    }

    const currentAttempts = peerReconnectAttemptsRef.current.get(callId) ?? 0;
    if (currentAttempts >= 1) {
      return false;
    }

    peerReconnectAttemptsRef.current.set(callId, currentAttempts + 1);

    if (typeof peer.restartIce === 'function') {
      try {
        peer.restartIce();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  };

  const ensurePeerConnection = (callId: string, remoteSessionId: string, localStream: MediaStream) => {
    if (
      peerConnectionRef.current &&
      peerConnectionCallIdRef.current === callId &&
      peerConnectionRef.current.signalingState !== 'closed' &&
      peerConnectionRef.current.connectionState !== 'closed' &&
      peerConnectionRef.current.connectionState !== 'failed'
    ) {
      return peerConnectionRef.current;
    }

    teardownPeerConnection();

    const peer = createCallPeerConnection({
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
        setRemoteCallStream(stream);
      },
      onIceConnectionStateChange: (state) => {
        if (state === 'connected' || state === 'completed') {
          clearCallDisconnectTimer();
          peerReconnectAttemptsRef.current.delete(callId);
          return;
        }

        if (state === 'failed') {
          setCallState((current) =>
            current && current.callId === callId
              ? {
                  ...current,
                  phase: 'reconnecting',
                  status: 'Repairing secure media path...'
                }
              : current
          );
          const recovered = attemptPeerRecovery(callId);
          scheduleCallDisconnectFallback(callId, recovered ? 'Call could not fully recover.' : 'Call connection ended.');
          return;
        }

        if (state === 'disconnected') {
          setCallState((current) =>
            current && current.callId === callId
              ? {
                  ...current,
                  phase: current.phase === 'connected' ? 'reconnecting' : current.phase,
                  status: 'Reconnecting secure media path...'
                }
              : current
          );

          const recovered = attemptPeerRecovery(callId);
          scheduleCallDisconnectFallback(callId, recovered ? 'Call could not fully recover.' : 'Call connection ended.');
        }
      },
      onConnectionStateChange: (state) => {
        if (state === 'connected') {
          toneControllerRef.current?.stop();
          clearCallDisconnectTimer();
          peerReconnectAttemptsRef.current.delete(callId);
          setCallState((current) =>
            current && current.callId === callId
              ? {
                  ...current,
                  phase: 'connected',
                  connectedAt: current.connectedAt ?? new Date().toISOString(),
                  status: current.mode === 'video' ? 'Encrypted video call live.' : 'Encrypted audio call live.'
                }
              : current
          );
          return;
        }

        if (state === 'connecting') {
          setCallState((current) =>
            current && current.callId === callId
              ? {
                  ...current,
                  phase: current.phase === 'reconnecting' ? 'reconnecting' : 'connecting',
                  status: current.phase === 'reconnecting' ? 'Reconnecting secure media path...' : 'Negotiating secure media...'
                }
              : current
          );
          return;
        }

        if (state === 'disconnected' || state === 'failed') {
          const activeCall = callStateRef.current;
          if (!activeCall || activeCall.callId !== callId) {
            return;
          }

          setCallState((current) =>
            current && current.callId === callId
              ? {
                  ...current,
                  phase: 'reconnecting',
                  status: state === 'failed' ? 'Repairing secure media path...' : 'Reconnecting secure media path...'
                }
              : current
          );

          const recovered = attemptPeerRecovery(callId);
          scheduleCallDisconnectFallback(callId, recovered ? 'Call could not fully recover.' : 'Call connection ended.');
          return;
        }

        if (state === 'closed') {
          clearCallDisconnectTimer();
        }
      }
    });

    peerConnectionRef.current = peer;
    peerConnectionCallIdRef.current = callId;
    return peer;
  };

  const isSessionError = (value: unknown) => {
    if (!(value instanceof Error)) return false;
    const message = value.message.toLowerCase();
    return (
      message.includes('access token expired') ||
      message.includes('invalid access token') ||
      message.includes('invalid refresh token') ||
      message.includes('refresh token expired') ||
      message.includes('refresh token reuse detected') ||
      message.includes('refresh token does not match this device') ||
      message.includes('missing bearer access token')
    );
  };

  const refreshStoredSession = async (activeSession: LoginResponse) => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshTask = (async () => {
      const latestSession = sessionRef.current ?? activeSession;
      const refreshed = await postJson<RefreshResponse>('/auth/refresh', {
        refresh_token: latestSession.refreshToken,
        device_id: deviceProfile.deviceId
      });

      const nextSession = {
        ...latestSession,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken
      };

      persistSession(nextSession);
      return nextSession;
    })();

    refreshPromiseRef.current = refreshTask;

    try {
      return await refreshTask;
    } finally {
      refreshPromiseRef.current = null;
    }
  };

  const refreshCallInfraConfig = async (activeSession: LoginResponse) => {
    try {
      const response = await fetch(`${getApiBase()}/calls/ice-config`, {
        headers: {
          Authorization: `Bearer ${activeSession.accessToken}`
        }
      });

      const json = (await response.json().catch(() => ({}))) as Partial<RuntimeIceConfig> & { message?: string };

      if (!response.ok) {
        throw new Error(json.message || 'Unable to load call relay configuration.');
      }

      const nextIceServers = Array.isArray(json.iceServers) ? json.iceServers : [];
      setRuntimeIceServers(nextIceServers.length > 0 ? nextIceServers : getFallbackIceServers());
      setCallInfraNotice(json.hasDedicatedTurn ? 'Dedicated TURN live' : 'Fallback relay active');
    } catch {
      setRuntimeIceServers(getFallbackIceServers());
      setCallInfraNotice('Fallback relay active');
    }
  };

  const searchRecipients = async (activeSession: LoginResponse, query: string) => {
    if (!query.trim()) {
      return [];
    }

    const response = await fetch(`${getApiBase()}/users/search?q=${encodeURIComponent(query.trim())}`, {
      headers: {
        Authorization: `Bearer ${activeSession.accessToken}`
      }
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof json?.message === 'string'
          ? json.message
          : typeof json?.error === 'string'
            ? json.error
            : 'Unable to search verified users.'
      );
    }

    return (json.users ?? []) as SearchUserResult[];
  };

  const withFreshSession = async <T,>(task: (activeSession: LoginResponse) => Promise<T>) => {
    const activeSession = sessionRef.current;

    if (!activeSession) {
      throw new Error('No active session. Please sign in again.');
    }

    try {
      return await task(activeSession);
    } catch (taskError) {
      if (!isSessionError(taskError)) {
        throw taskError;
      }

      const refreshed = await refreshStoredSession(activeSession);
      return await task(refreshed);
    }
  };

  const reloadConversationSummaries = async (activeSession: LoginResponse) => {
    const summaries = await listConversationSummaries(activeSession, deviceProfile);
    setConversationSummaries(summaries);

    if (!selectedConversationRef.current && allowAutoThreadOpenRef.current && summaries.length > 0) {
      setSelectedConversation(summaries[0].conversationKey);
    }
  };

  const reloadConversation = async (activeSession: LoginResponse, conversationKey: string) => {
    if (!conversationKey) {
      setMessages([]);
      return;
    }

    const records = await listConversationMessages(activeSession, deviceProfile, conversationKey);
    setMessages(records);
  };

  const reloadCallHistory = async (activeSession: LoginResponse, conversationKey: string) => {
    if (!conversationKey) {
      setCallHistory([]);
      return;
    }

    const records = await listConversationCallRecords(activeSession, deviceProfile, conversationKey);
    setCallHistory(records);
  };

  const getConversationTimeline = (conversationMessages: LocalMessageRecord[], conversationCalls: CallLogRecord[]) => {
    const messageEvents = conversationMessages.map((message) => ({
      id: `message:${message.id}`,
      createdAt: message.createdAt,
      type: 'message' as const,
      message
    }));

    const callEvents = conversationCalls.map((entry) => ({
      id: `call:${entry.id}`,
      createdAt: entry.startedAt,
      type: 'call' as const,
      call: entry
    }));

    return [...messageEvents, ...callEvents].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  };

  const hydrateSocialSurface = (bootstrap: SocialBootstrap) => {
    setSocialBootstrap({
      ...bootstrap,
      me: {
        ...bootstrap.me,
        avatarUrl: resolveSocialMediaUrl(bootstrap.me.avatarUrl)
      },
      stories: bootstrap.stories.map((story) => ({
        ...story,
        mediaUrl: resolveSocialMediaUrl(story.mediaUrl) ?? story.mediaUrl,
        author: {
          ...story.author,
          avatarUrl: resolveSocialMediaUrl(story.author.avatarUrl)
        }
      })),
      feed: bootstrap.feed.map((post) => ({
        ...post,
        mediaUrl: resolveSocialMediaUrl(post.mediaUrl),
        author: {
          ...post.author,
          avatarUrl: resolveSocialMediaUrl(post.author.avatarUrl)
        }
      })),
      suggestions: bootstrap.suggestions.map((profile) => ({
        ...profile,
        avatarUrl: resolveSocialMediaUrl(profile.avatarUrl)
      }))
    });
  };

  const reloadSocialBootstrap = async (activeSession: LoginResponse) => {
    const bootstrap = await fetchSocialBootstrap(activeSession);
    hydrateSocialSurface(bootstrap);
    setProfileForm((current) => ({
      ...current,
      displayName: bootstrap.me.displayName,
      bio: bootstrap.me.bio
    }));
  };

  const replacePostInBootstrap = (post: SocialPost) => {
    const normalizedPost = {
      ...post,
      mediaUrl: resolveSocialMediaUrl(post.mediaUrl),
      author: {
        ...post.author,
        avatarUrl: resolveSocialMediaUrl(post.author.avatarUrl)
      }
    };

    setSocialBootstrap((current) =>
      current
        ? {
            ...current,
            feed: current.feed.some((entry) => entry.id === normalizedPost.id)
              ? current.feed.map((entry) => (entry.id === normalizedPost.id ? normalizedPost : entry))
              : [normalizedPost, ...current.feed]
          }
        : current
    );
  };

  const classifyCallOutcome = (activeCall: CallOverlayState, reason: string): CallLogRecord['outcome'] => {
    const normalized = reason.toLowerCase().replaceAll(' ', '_');

    if (normalized.includes('declined')) {
      return 'declined';
    }

    if (normalized.includes('cancelled')) {
      return 'cancelled';
    }

    if (
      normalized.includes('unavailable') ||
      normalized.includes('offline') ||
      normalized.includes('busy') ||
      normalized.includes('not_found')
    ) {
      return 'unavailable';
    }

    if (normalized.includes('missed') || normalized.includes('answered_elsewhere')) {
      return 'missed';
    }

    if (activeCall.phase === 'connected') {
      return 'completed';
    }

    if (
      normalized.includes('peer_disconnected') ||
      normalized.includes('caller_disconnected') ||
      normalized.includes('connection_lost') ||
      normalized.includes('media_unavailable')
    ) {
      return 'failed';
    }

    return 'failed';
  };

  const persistCallRecord = async (
    activeCall: CallOverlayState,
    reason: string,
    outcomeOverride?: CallLogRecord['outcome']
  ) => {
    const activeSession = sessionRef.current;
    if (!activeSession) {
      return;
    }

    const endedAt = new Date().toISOString();
    const durationSource = activeCall.connectedAt ?? activeCall.startedAt;
    const durationSeconds =
      activeCall.connectedAt
        ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(durationSource)) / 1000))
        : 0;

    await saveConversationCallRecord(activeSession, deviceProfile, {
      id: `${activeCall.callId}:${activeCall.direction}:${endedAt}`,
      conversationKey: activeCall.remoteLabel,
      remoteLabel: activeCall.remoteLabel,
      direction: activeCall.direction,
      mode: activeCall.mode,
      outcome: outcomeOverride ?? classifyCallOutcome(activeCall, reason),
      statusText: reason,
      startedAt: activeCall.startedAt,
      endedAt,
      durationSeconds
    });

    if (selectedConversationRef.current === activeCall.remoteLabel) {
      await reloadCallHistory(activeSession, activeCall.remoteLabel);
    }
  };

  const prepareLocalCallMedia = async (mode: CallMode, muted: boolean, cameraEnabled: boolean) => {
    stopMediaStream(localCallStreamRef.current);
    localCallStreamRef.current = null;
    setLocalCallStream(null);
    const stream = await requestCallMedia(mode);
    setMicrophoneMuted(stream, muted);
    if (mode === 'video') {
      setCameraEnabled(stream, cameraEnabled);
    }
    localCallStreamRef.current = stream;
    setLocalCallStream(stream);
    return stream;
  };

  const getPreparedLocalCallMedia = async (mode: CallMode, muted: boolean, cameraEnabled: boolean) => {
    const currentStream = localCallStreamRef.current;
    const currentHasVideo = (currentStream?.getVideoTracks().length ?? 0) > 0;
    const needsFreshStream =
      !currentStream || (mode === 'video' && !currentHasVideo) || (mode === 'audio' && currentHasVideo);

    if (needsFreshStream) {
      return prepareLocalCallMedia(mode, muted, cameraEnabled);
    }

    setMicrophoneMuted(currentStream, muted);
    if (mode === 'video') {
      setCameraEnabled(currentStream, cameraEnabled);
    }
    return currentStream;
  };

  const startOutgoingOffer = async (callId: string, peerSessionId: string) => {
    const activeCall = callStateRef.current;
    if (!activeCall) {
      return;
    }

    const localStream = await getPreparedLocalCallMedia(activeCall.mode, activeCall.muted, activeCall.cameraEnabled);

    const peer = ensurePeerConnection(callId, peerSessionId, localStream);
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
  };

  const handleRelayCallEvent = async (event: RelayCallEvent) => {
    switch (event.type) {
      case 'call_invite': {
        const existingCall = callStateRef.current;
        if (existingCall) {
          relayHandleRef.current?.send({
            type: 'call_reject',
            callId: event.callId,
            reason: 'busy'
          });
          return;
        }

        setCallState({
          callId: event.callId,
          direction: 'incoming',
          phase: 'ringing',
          mode: event.mode,
          remoteLabel: event.callerUsername,
          remoteSessionId: event.callerSessionId,
          muted: false,
          speakerMuted: false,
          cameraEnabled: event.mode === 'video',
          ringtoneSilenced: false,
          status: `${event.mode === 'video' ? 'Incoming video call' : 'Incoming audio call'} from ${event.callerUsername}`,
          startedAt: new Date().toISOString()
        });
        allowAutoThreadOpenRef.current = true;
        setSelectedConversation(event.callerUsername);
        setRecipientLookup(event.callerUsername);
        void toneControllerRef.current?.play('incoming');
        break;
      }
      case 'call_ringing': {
        setCallState((current) =>
          current && current.callId === event.callId
            ? {
                ...current,
                phase: 'ringing',
                remoteLabel: event.recipientUsername,
                status: `Ringing ${event.recipientUsername}...`
              }
            : current
        );
        void toneControllerRef.current?.play('outgoing');
        break;
      }
      case 'call_unavailable': {
        const activeCall = callStateRef.current;
        if (!activeCall || activeCall.callId !== event.callId) {
          return;
        }

        await finishLocalCall(event.reason, 'unavailable');
        break;
      }
      case 'call_rejected': {
        const activeCall = callStateRef.current;
        if (!activeCall || activeCall.callId !== event.callId) {
          return;
        }

        await finishLocalCall(`Call declined: ${event.reason}.`, 'declined');
        break;
      }
      case 'call_accepted': {
        try {
          setCallState((current) =>
            current && current.callId === event.callId
              ? {
                  ...current,
                  phase: 'connecting',
                  remoteSessionId: event.peerSessionId,
                  status: 'Joining encrypted call...'
                }
              : current
          );
          toneControllerRef.current?.stop();
          await startOutgoingOffer(event.callId, event.peerSessionId);
        } catch (callError) {
          relayHandleRef.current?.send({
            type: 'call_end',
            callId: event.callId,
            reason: 'media_unavailable'
          });
          await finishLocalCall('Call setup failed.', 'failed');
          setError(callError instanceof Error ? callError.message : 'Unable to start microphone/camera.');
        }
        break;
      }
      case 'call_join': {
        setCallState((current) =>
          current && current.callId === event.callId
            ? {
                ...current,
                phase: 'connecting',
                remoteSessionId: event.peerSessionId,
                status: 'Waiting for secure media handshake...'
              }
            : current
        );
        break;
      }
      case 'call_signal': {
        const activeCall = callStateRef.current;
        if (!activeCall || activeCall.callId !== event.callId) {
          return;
        }

        const remoteSessionId = activeCall.remoteSessionId ?? event.fromSessionId;
        const localStream = localCallStreamRef.current;
        if (!localStream) {
          return;
        }

        const peer = ensurePeerConnection(event.callId, remoteSessionId, localStream);

        if (event.signal.type === 'offer') {
          await peer.setRemoteDescription({
            type: 'offer',
            sdp: event.signal.sdp
          });
          await flushQueuedIceCandidates(event.callId, peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          relayHandleRef.current?.send({
            type: 'call_signal',
            callId: event.callId,
            targetSessionId: event.fromSessionId,
            signal: {
              type: 'answer',
              sdp: answer.sdp ?? ''
            }
          });
          break;
        }

        if (event.signal.type === 'answer') {
          await peer.setRemoteDescription({
            type: 'answer',
            sdp: event.signal.sdp
          });
          await flushQueuedIceCandidates(event.callId, peer);
          break;
        }

        if (event.signal.type !== 'ice-candidate') {
          break;
        }

        const candidate = event.signal.candidate;
        if (peer.remoteDescription) {
          await peer.addIceCandidate(candidate);
        } else {
          queueIceCandidate(event.callId, candidate);
        }
        break;
      }
      case 'call_ended': {
        const activeCall = callStateRef.current;
        if (!activeCall || activeCall.callId !== event.callId) {
          return;
        }

        await finishLocalCall(`Call ended: ${event.reason.replaceAll('_', ' ')}.`);
        break;
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const hydrateStoredSession = async () => {
      if (!session) {
        setSessionHydrated(true);
        return;
      }

      try {
        const refreshed = await refreshStoredSession(session);
        if (cancelled) return;
        setMode('chat');
        setNotice(`Trusted device session restored for ${refreshed.user.username}.`);
      } catch (restoreError) {
        if (cancelled) return;
        if (isSessionError(restoreError)) {
          clearSessionState('Saved session expired. Please sign in again.', { resetSignalState: true });
          setMode('login');
          return;
        }

        setMode('chat');
        setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore the saved session right now.');
        setNotice('Saved session kept locally. Retry once the backend is reachable.');
      } finally {
        if (!cancelled) {
          setSessionHydrated(true);
        }
      }
    };

    void hydrateStoredSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    if (!session) {
      setSignalReady(false);
      setRelayStatus('offline');
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const activeSession = await withFreshSession(async (usableSession) => {
          await bootstrapSignalDevice(usableSession, deviceProfile);
          return usableSession;
        });
        if (cancelled) return;
        setSignalReady(true);
        await refreshCallInfraConfig(activeSession);
        await reloadSocialBootstrap(activeSession);
        await reloadConversationSummaries(activeSession);
        if (selectedConversation) {
          await reloadConversation(activeSession, selectedConversation);
        }
      } catch (bootstrapError) {
        if (cancelled) return;
        if (isSessionError(bootstrapError)) {
          clearSessionState('Your session expired. Please sign in again.', { resetSignalState: true });
          setMode('login');
          return;
        }
        setError(bootstrapError instanceof Error ? bootstrapError.message : 'Signal bootstrap failed.');
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [sessionHydrated, session]);

  useEffect(() => {
    if (!session || !signalReady) return;

    const relayHandle = connectDirectRelay(session, deviceProfile, {
      onStatus: (status, detail) => {
        if (status === 'connected') {
          setRelayStatus('connected');
          if (notice.toLowerCase().includes('relay')) {
            setNotice('Secure relay connected.');
          }
        } else if (status === 'connecting') {
          setRelayStatus('connecting');
        } else if (status === 'disconnected') {
          setRelayStatus('offline');
        } else {
          setRelayStatus('error');
          if (detail) {
            setError(detail);
          }
        }
      },
      onCallEvent: (event) => handleRelayCallEvent(event),
      onMessage: async (message) => {
        await withFreshSession(async (activeSession) => {
          await reloadConversationSummaries(activeSession);
          if (selectedConversationRef.current === message.conversationKey) {
            await reloadConversation(activeSession, message.conversationKey);
            await reloadCallHistory(activeSession, message.conversationKey);
          }
          return activeSession;
        });
      }
    });
    relayHandleRef.current = relayHandle;

    return () => {
      relayHandleRef.current = null;
      relayHandle.disconnect();
    };
  }, [session, signalReady]);

  useEffect(() => {
    if (!session || !signalReady) return;

    let disposed = false;
    let timer: number | null = null;

    const scheduleNext = (delayMs: number) => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        void sync();
      }, delayMs);
    };

    const sync = async () => {
      let nextDelayMs = relayStatus === 'connected' ? 15000 : 5000;

      if (callStateRef.current) {
        scheduleNext(30000);
        return;
      }

      try {
        const activeSession = await withFreshSession(async (usableSession) => {
          await syncDirectInbox(usableSession, deviceProfile);
          return usableSession;
        });
        if (disposed) return;
        if (notice.toLowerCase().includes('rate limit')) {
          setNotice('Secure inbox sync restored.');
        }
        if (error.toLowerCase().includes('rate limit')) {
          setError('');
        }
        await reloadConversationSummaries(activeSession);
        if (selectedConversation) {
          await reloadConversation(activeSession, selectedConversation);
          await reloadCallHistory(activeSession, selectedConversation);
        }
      } catch (syncError) {
        if (disposed) return;
        if (isSessionError(syncError)) {
          clearSessionState('Your session expired. Please sign in again.', { resetSignalState: true });
          setMode('login');
          return;
        }
        const message = syncError instanceof Error ? syncError.message : 'Inbox sync failed.';
        if (message.toLowerCase().includes('rate limit')) {
          setError('');
          setNotice(message);
          nextDelayMs = 15000;
        } else {
          setError(message);
        }
      } finally {
        if (!disposed) {
          scheduleNext(nextDelayMs);
        }
      }
    };

    void sync();

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [session, signalReady, selectedConversation, relayStatus, callState?.callId]);

  useEffect(() => {
    if (!session || !selectedConversation) {
      setMessages([]);
      setCallHistory([]);
      return;
    }

    void reloadConversation(session, selectedConversation);
    void reloadCallHistory(session, selectedConversation);
  }, [selectedConversation, session]);

  useEffect(() => {
    if (!session || !signalReady) {
      setRecipientResults([]);
      return;
    }

    const trimmed = recipientLookup.trim();
    if (!trimmed) {
      setRecipientResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setRecipientSearchBusy(true);
      void withFreshSession((activeSession) => searchRecipients(activeSession, trimmed))
        .then((results) => {
          if (!cancelled) {
            setRecipientResults(results);
          }
        })
        .catch((searchError) => {
          if (!cancelled && !isSessionError(searchError)) {
            setError(searchError instanceof Error ? searchError.message : 'User search failed.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRecipientSearchBusy(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [recipientLookup, session, signalReady]);

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    resetSurface();
    setBusy(true);

    try {
      const reachable = await probeBackend();
      if (!reachable) {
        throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
      }

      const result = await postJson<SignupResponse>('/auth/signup', {
        username: signup.username,
        email: signup.email,
        password: signup.password,
        device_id: deviceProfile.deviceId,
        device_name: deviceProfile.deviceName,
        device_public_key: devicePublicKey
      });

      setLogin({
        identifier: signup.username,
        password: signup.password
      });
      setVerificationEmail(signup.email);
      setVerificationCode(result.verificationCodePreview ?? '');
      setMode('verify');
      setNotice(
        result.verificationCodePreview
          ? 'Signup complete. A development verification code was generated for this environment.'
          : result.verificationEmailSent
            ? `Signup complete. Check ${signup.email} for your 6-digit verification code.`
            : 'Signup complete. SMTP is not configured on this environment yet, so verification email delivery is not active.'
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Signup failed.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCurrentCode = async () => {
    if (!verificationEmail.trim()) {
      setError('Enter the email address for the account you want to verify.');
      return;
    }

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('Enter the 6-digit verification code from your email.');
      return;
    }

    resetSurface();
    setBusy(true);

    try {
      const reachable = await probeBackend();
      if (!reachable) {
        throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
      }

      await postJson<{ verified: boolean }>('/auth/verify-email', {
        email: verificationEmail.trim(),
        code: verificationCode.trim()
      });
      setMode('login');
      setNotice('Email verified. You can now sign in on this trusted device.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    await verifyCurrentCode();
  };

  const handleResendVerification = async () => {
    if (!verificationEmail.trim()) {
      setError('Enter the email address for the account you want to verify.');
      return;
    }

    resetSurface();
    setBusy(true);

    try {
      const reachable = await probeBackend();
      if (!reachable) {
        throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
      }

      await postJson<{ success: true }>('/auth/resend-verification', {
        email: verificationEmail.trim()
      });

      setNotice(`Verification code sent to ${verificationEmail.trim()}. Check your inbox and spam folder.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to resend verification email.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    resetSurface();
    setBusy(true);

    try {
      const reachable = await probeBackend();
      if (!reachable) {
        throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
      }

      const result = await postJson<LoginResponse>('/auth/login', {
        identifier: login.identifier,
        password: login.password,
        device_id: deviceProfile.deviceId,
        device_name: deviceProfile.deviceName,
        device_public_key: devicePublicKey
      });

      persistSession(result);
      setSignalReady(false);
      setSelectedConversation('');
      setRecipientLookup('');
      setRecipientResults([]);
      setMode('chat');
      setNotice('Login successful. Signal bootstrap will start automatically.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    if (!session) return;

    resetSurface();
    setBusy(true);

    try {
      const refreshed = await refreshStoredSession(session);
      await reloadSocialBootstrap(refreshed);
      setNotice('Refresh token rotated successfully.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!session) return;

    resetSurface();
    setBusy(true);

    try {
      await postJson<{ success: true }>('/auth/logout', {
        refresh_token: session.refreshToken
      });

      clearSessionState(undefined, { resetSignalState: true });
      setMode('login');
      setNotice('Refresh token revoked and local session cleared.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Logout failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleProfileAvatarSelected = (event: ChangeEvent<HTMLInputElement>) => {
    setProfileForm((current) => ({
      ...current,
      avatarFile: event.target.files?.[0] ?? null
    }));
  };

  const handlePostMediaSelected = (event: ChangeEvent<HTMLInputElement>) => {
    setPostComposer((current) => ({
      ...current,
      mediaFile: event.target.files?.[0] ?? null
    }));
  };

  const handleStoryMediaSelected = (event: ChangeEvent<HTMLInputElement>) => {
    setStoryComposer((current) => ({
      ...current,
      mediaFile: event.target.files?.[0] ?? null
    }));
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    resetSurface();
    setProfileBusy(true);

    try {
      await withFreshSession(async (activeSession) => {
        let avatarMediaId: string | null | undefined;

        if (profileForm.avatarFile) {
          const uploaded = await uploadSocialMedia(activeSession, 'avatar', profileForm.avatarFile);
          avatarMediaId = uploaded.assetId;
        }

        const profile = await updateMyProfile(activeSession, {
          displayName: profileForm.displayName.trim() || undefined,
          bio: profileForm.bio.trim(),
          avatarMediaId
        });

        setSocialBootstrap((current) =>
          current
            ? {
                ...current,
                me: {
                  ...profile,
                  avatarUrl: resolveSocialMediaUrl(profile.avatarUrl)
                },
                feed: current.feed.map((post) =>
                  post.author.username === profile.username
                    ? {
                        ...post,
                        author: {
                          ...post.author,
                          displayName: profile.displayName,
                          avatarUrl: resolveSocialMediaUrl(profile.avatarUrl)
                        }
                      }
                    : post
                ),
                stories: current.stories.map((story) =>
                  story.author.username === profile.username
                    ? {
                        ...story,
                        author: {
                          ...story.author,
                          displayName: profile.displayName,
                          avatarUrl: resolveSocialMediaUrl(profile.avatarUrl)
                        }
                      }
                    : story
                )
              }
            : current
        );
        setProfileForm((current) => ({ ...current, avatarFile: null }));
      });

      setNotice('Profile updated.');
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Unable to update profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleCreatePost = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    if (!postComposer.caption.trim() && !postComposer.mediaFile) {
      setError('Add a caption or choose media before posting.');
      return;
    }

    resetSurface();
    setPostBusy(true);

    try {
      const post = await withFreshSession(async (activeSession) => {
        let mediaAssetId: string | null | undefined;
        if (postComposer.mediaFile) {
          const uploaded = await uploadSocialMedia(activeSession, 'post', postComposer.mediaFile);
          mediaAssetId = uploaded.assetId;
        }

        return createPost(activeSession, {
          caption: postComposer.caption,
          visibility: postComposer.visibility,
          mediaAssetId
        });
      });

      replacePostInBootstrap(post);
      setPostComposer({
        caption: '',
        visibility: 'public',
        mediaFile: null
      });
      setNotice('Post published to the feed.');
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : 'Unable to publish post.');
    } finally {
      setPostBusy(false);
    }
  };

  const handleCreateStory = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !storyComposer.mediaFile) {
      setError('Choose a story image or video first.');
      return;
    }

    resetSurface();
    setStoryBusy(true);

    try {
      const story = await withFreshSession(async (activeSession) => {
        const uploaded = await uploadSocialMedia(activeSession, 'story', storyComposer.mediaFile!);
        return createStory(activeSession, {
          caption: storyComposer.caption,
          visibility: storyComposer.visibility,
          mediaAssetId: uploaded.assetId
        });
      });

      setSocialBootstrap((current) =>
        current
          ? {
              ...current,
              stories: [
                {
                  ...story,
                  mediaUrl: resolveSocialMediaUrl(story.mediaUrl) ?? story.mediaUrl,
                  author: {
                    ...story.author,
                    avatarUrl: resolveSocialMediaUrl(story.author.avatarUrl)
                  }
                },
                ...current.stories.filter((entry) => entry.id !== story.id)
              ]
            }
          : current
      );
      setStoryComposer({
        caption: '',
        visibility: 'public',
        mediaFile: null
      });
      setNotice('Story is live for the next 24 hours.');
    } catch (storyError) {
      setError(storyError instanceof Error ? storyError.message : 'Unable to publish story.');
    } finally {
      setStoryBusy(false);
    }
  };

  const handleDeletePost = async (post: SocialPost) => {
    if (!session) {
      return;
    }

    resetSurface();
    setPostBusy(true);

    try {
      await withFreshSession((activeSession) => deletePost(activeSession, post.id));
      setSocialBootstrap((current) =>
        current
          ? {
              ...current,
              feed: current.feed.filter((entry) => entry.id !== post.id)
            }
          : current
      );
      setNotice('Post deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this post right now.');
    } finally {
      setPostBusy(false);
    }
  };

  const handleToggleFollow = async (profile: SocialProfile) => {
    if (!session) {
      return;
    }

    resetSurface();
    setFollowBusyUsers((current) => (current.includes(profile.username) ? current : [...current, profile.username]));

    try {
      const nextProfile = await withFreshSession((activeSession) =>
        profile.isFollowing ? unfollowUser(activeSession, profile.username) : followUser(activeSession, profile.username)
      );

      setSocialBootstrap((current) =>
        current
          ? {
              ...current,
              me: {
                ...current.me,
                followingCount:
                  current.me.followingCount + (profile.isFollowing ? -1 : 1)
              },
              suggestions: current.suggestions.map((entry) =>
                entry.username === profile.username
                  ? {
                      ...entry,
                      ...nextProfile,
                      avatarUrl: resolveSocialMediaUrl(nextProfile.avatarUrl)
                    }
                  : entry
              ),
              feed: current.feed.map((post) =>
                post.author.username === nextProfile.username
                  ? {
                      ...post,
                      author: {
                        ...post.author,
                        displayName: nextProfile.displayName,
                        avatarUrl: resolveSocialMediaUrl(nextProfile.avatarUrl)
                      }
                    }
                  : post
              )
            }
          : current
      );
      setNotice(profile.isFollowing ? `Unfollowed ${profile.username}.` : `Following ${profile.username}.`);
      await withFreshSession((activeSession) => reloadSocialBootstrap(activeSession));
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : 'Unable to update follow state.');
    } finally {
      setFollowBusyUsers((current) => current.filter((entry) => entry !== profile.username));
    }
  };

  const handleTogglePostLike = async (post: SocialPost) => {
    if (!session) {
      return;
    }

    const optimisticPost: SocialPost = {
      ...post,
      likedByMe: !post.likedByMe,
      likeCount: Math.max(0, post.likeCount + (post.likedByMe ? -1 : 1))
    };

    replacePostInBootstrap(optimisticPost);

    try {
      const updated = await withFreshSession(async (activeSession) => {
        const nextPost = await (
        post.likedByMe ? unlikePost(activeSession, post.id) : likePost(activeSession, post.id)
        );
        return { activeSession, nextPost };
      });
      replacePostInBootstrap(updated.nextPost);
      await reloadSocialBootstrap(updated.activeSession);
    } catch (likeError) {
      replacePostInBootstrap(post);
      setError(likeError instanceof Error ? likeError.message : 'Unable to update this post right now.');
    }
  };

  const handlePostCommentChange = (postId: string, value: string) => {
    setSocialCommentDrafts((current) => ({
      ...current,
      [postId]: value
    }));
  };

  const handleAddPostComment = async (postId: string) => {
    if (!session) {
      return;
    }

    const body = (socialCommentDrafts[postId] ?? '').trim();
    if (!body) {
      return;
    }

    try {
      const updated = await withFreshSession((activeSession) => addPostComment(activeSession, postId, body));
      replacePostInBootstrap(updated);
      setSocialCommentDrafts((current) => ({
        ...current,
        [postId]: ''
      }));
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : 'Unable to add a comment right now.');
    }
  };

  const handleOpenStory = async (storyId: string) => {
    if (!session) {
      return;
    }

    try {
      const updated = await withFreshSession((activeSession) => markStoryViewed(activeSession, storyId));
      if (!updated) {
        return;
      }

      setSocialBootstrap((current) =>
        current
          ? {
              ...current,
              stories: current.stories.map((story) =>
                story.id === storyId
                  ? {
                      ...story,
                      viewedByMe: true,
                      viewCount: updated.viewCount
                    }
                  : story
              )
            }
          : current
      );
    } catch (storyError) {
      setError(storyError instanceof Error ? storyError.message : 'Unable to update story view state.');
    }
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !messageDraft.trim() || !activeConversationKey) return;

    resetSurface();
    setBusy(true);

    try {
      const targetConversation = activeConversationKey;
      const { activeSession } = await withFreshSession(async (usableSession) => {
        await sendDirectText(usableSession, deviceProfile, targetConversation, messageDraft.trim());
        return {
          activeSession: usableSession
        };
      });
      const records = await listConversationMessages(activeSession, deviceProfile, targetConversation);
      setMessageDraft('');
      await reloadConversationSummaries(activeSession);
      setSelectedConversation(targetConversation);
      setRecipientResults([]);
      setMessages(records);
      setNotice('Encrypted message relayed. Waiting for recipient device fetch.');
    } catch (sendError) {
      if (isSessionError(sendError)) {
        clearSessionState('Your session expired. Please sign in again.', { resetSignalState: true });
        setMode('login');
      } else {
      setError(sendError instanceof Error ? sendError.message : 'Message send failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAttachmentSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAttachmentDraft(file);
    event.target.value = '';
  };

  const handleSendAttachment = async () => {
    if (!session || !attachmentDraft || !activeConversationKey) return;

    resetSurface();
    setBusy(true);

    try {
      const targetConversation = activeConversationKey;
      const { activeSession } = await withFreshSession(async (usableSession) => {
        await sendDirectAttachment(usableSession, deviceProfile, targetConversation, attachmentDraft);
        return {
          activeSession: usableSession
        };
      });
      const records = await listConversationMessages(activeSession, deviceProfile, targetConversation);
      setAttachmentDraft(null);
      await reloadConversationSummaries(activeSession);
      setSelectedConversation(targetConversation);
      setRecipientResults([]);
      setMessages(records);
      setNotice('Encrypted attachment uploaded and relayed successfully.');
    } catch (attachmentError) {
      if (isSessionError(attachmentError)) {
        clearSessionState('Your session expired. Please sign in again.', { resetSignalState: true });
        setMode('login');
      } else {
        setError(attachmentError instanceof Error ? attachmentError.message : 'Attachment send failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const closeAttachmentViewer = () => {
    setAttachmentViewer((current) => {
      if (current) {
        URL.revokeObjectURL(current.objectUrl);
      }
      return null;
    });
  };

  const downloadAttachmentViewer = () => {
    if (!attachmentViewer) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = attachmentViewer.objectUrl;
    anchor.download = attachmentViewer.fileName;
    anchor.click();
  };

  const handleOpenAttachment = async (message: LocalMessageRecord) => {
    if (!session || !message.attachment) return;

    resetSurface();
    setBusy(true);

    try {
      const { blob, fileName } = await withFreshSession((activeSession) => downloadDirectAttachment(activeSession, message));
      const objectUrl = URL.createObjectURL(blob);
      setAttachmentViewer((current) => {
        if (current) {
          URL.revokeObjectURL(current.objectUrl);
        }

        return {
          fileName,
          mimeType: blob.type || message.attachment?.mimeType || 'application/octet-stream',
          objectUrl,
          sizeLabel: `${Math.max(1, Math.round(blob.size / 1024))} KB`,
          previewKind:
            blob.type.startsWith('image/')
              ? 'image'
              : blob.type === 'application/pdf'
                ? 'pdf'
                : 'document'
        };
      });
      setNotice(`Decrypted attachment ready: ${fileName}`);
    } catch (downloadError) {
      if (isSessionError(downloadError)) {
        clearSessionState('Your session expired. Please sign in again.', { resetSignalState: true });
        setMode('login');
      } else {
        setError(downloadError instanceof Error ? downloadError.message : 'Attachment download failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStartCall = async (mode: CallMode) => {
    if (!session || !signalReady || relayStatus !== 'connected' || !activeConversationKey || callStateRef.current) {
      return;
    }

    resetSurface();

    try {
      await withFreshSession(async (activeSession) => {
        await refreshCallInfraConfig(activeSession);
        return activeSession;
      });
    } catch (callConfigError) {
      setError(callConfigError instanceof Error ? callConfigError.message : 'Unable to prepare call relay configuration.');
      return;
    }

    const callId = crypto.randomUUID();
    const nextCallState: CallOverlayState = {
      callId,
      direction: 'outgoing',
      phase: 'ringing',
      mode,
      remoteLabel: activeConversationKey,
      remoteSessionId: null,
      muted: false,
      speakerMuted: false,
      cameraEnabled: mode === 'video',
      ringtoneSilenced: false,
      status: `Calling ${activeConversationKey}...`,
      startedAt: new Date().toISOString()
    };

    setCallState(nextCallState);
    const sent = relayHandleRef.current?.send({
      type: 'call_invite',
      callId,
      recipientLookup: activeConversationKey,
      mode
    });

    if (!sent) {
      setCallState(null);
      setError('Realtime relay is not ready for calling yet.');
      return;
    }

    void toneControllerRef.current?.play('outgoing');
  };

  const handleAcceptCall = async () => {
    const activeCall = callStateRef.current;
    if (!activeCall || activeCall.direction !== 'incoming' || !activeCall.remoteSessionId) {
      return;
    }

    resetSurface();

    try {
      const localStream = await getPreparedLocalCallMedia(activeCall.mode, activeCall.muted, activeCall.cameraEnabled);
      ensurePeerConnection(activeCall.callId, activeCall.remoteSessionId, localStream);
      toneControllerRef.current?.stop();
      setCallState({
        ...activeCall,
        phase: 'connecting',
        status: 'Joining encrypted call...'
      });
      relayHandleRef.current?.send({
        type: 'call_accept',
        callId: activeCall.callId
      });
    } catch (callError) {
      relayHandleRef.current?.send({
        type: 'call_reject',
        callId: activeCall.callId,
        reason: 'media_unavailable'
      });
      await finishLocalCall('Call setup failed.', 'failed');
      setError(callError instanceof Error ? callError.message : 'Unable to access microphone/camera.');
    }
  };

  const handleRejectCall = () => {
    const activeCall = callStateRef.current;
    if (!activeCall) {
      return;
    }

    relayHandleRef.current?.send({
      type: activeCall.direction === 'incoming' ? 'call_reject' : 'call_end',
      callId: activeCall.callId,
      reason: activeCall.direction === 'incoming' ? 'declined' : 'cancelled'
    });
    void finishLocalCall(activeCall.direction === 'incoming' ? 'Call declined.' : 'Call cancelled.');
  };

  const handleEndCall = () => {
    const activeCall = callStateRef.current;
    if (!activeCall) {
      return;
    }

    relayHandleRef.current?.send({
      type: 'call_end',
      callId: activeCall.callId,
      reason: 'ended'
    });
    void finishLocalCall('Call ended.');
  };

  const handleSilenceRingtone = () => {
    toneControllerRef.current?.stop();
    setCallState((current) => (current ? { ...current, ringtoneSilenced: true } : current));
  };

  const handleToggleCallMute = () => {
    setCallState((current) => {
      if (!current) {
        return current;
      }

      const nextMuted = !current.muted;
      setMicrophoneMuted(localCallStreamRef.current, nextMuted);
      return {
        ...current,
        muted: nextMuted
      };
    });
  };

  const handleToggleSpeakerMute = () => {
    setCallState((current) =>
      current
        ? {
            ...current,
            speakerMuted: !current.speakerMuted
          }
        : current
    );
  };

  const handleToggleCamera = () => {
    setCallState((current) => {
      if (!current || current.mode !== 'video') {
        return current;
      }

      const nextCameraEnabled = !current.cameraEnabled;
      setCameraEnabled(localCallStreamRef.current, nextCameraEnabled);
      return {
        ...current,
        cameraEnabled: nextCameraEnabled
      };
    });
  };

  const handleSelectThread = (conversationKey: string) => {
    allowAutoThreadOpenRef.current = true;
    setSelectedConversation(conversationKey);
    setRecipientLookup(conversationKey);
    setRecipientResults([]);
  };

  const handleClearSelectedThread = () => {
    allowAutoThreadOpenRef.current = false;
    setSelectedConversation('');
    setRecipientLookup('');
    setRecipientResults([]);
    setMessages([]);
    setCallHistory([]);
    setMessageDraft('');
    setAttachmentDraft(null);
  };

  const authFeedback = (notice || error) && (
    <div className={error ? 'notice error inline-feedback auth-feedback' : 'notice success inline-feedback auth-feedback'}>{error || notice}</div>
  );

  const handleForgotPassword = () => {
    setError('');
    setNotice('');
    setResetPasswordForm((current) => ({
      ...current,
      email: login.identifier.includes('@') ? login.identifier.trim() : current.email
    }));
    setMode('reset');
  };

  const handleSocialAuthClick = (provider: 'google' | 'apple') => {
    setError('');
    setNotice(
      provider === 'google'
        ? 'Google sign-in is ready for app wiring, but the real OAuth client is still missing.'
        : 'Apple sign-in is ready for app wiring, but the real Apple developer setup is still missing.'
    );
  };

  const handleRequestPasswordReset = async () => {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await postJson<{ success: true; resetEmailSent?: boolean; resetCodePreview?: string }>('/auth/request-password-reset', {
        email: resetPasswordForm.email
      });

      setNotice(
        result.resetCodePreview
          ? `Reset code sent. Development preview: ${result.resetCodePreview}`
          : 'Reset code sent to your email.'
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send password reset code.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      await postJson<{ success: true }>('/auth/reset-password', {
        email: resetPasswordForm.email,
        code: resetPasswordForm.code,
        new_password: resetPasswordForm.newPassword
      });

      setResetPasswordForm((current) => ({
        email: current.email,
        code: '',
        newPassword: ''
      }));
      setResetPasswordVisible(false);
      setMode('login');
      setNotice('Password reset complete. You can sign in now.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={mode === 'chat' ? 'auth-shell' : 'auth-shell auth-shell-premium'}>
      {mode !== 'chat' ? (
        <section className="auth-stage">
          <div className="auth-cosmic auth-cosmic-left" />
          <div className="auth-cosmic auth-cosmic-right" />
          <div className="auth-cosmic auth-cosmic-bottom" />

          <div className="auth-brand-block">
            <div className="auth-logo-frame">
              {authLogoSrc ? <img alt="Kryno logo" className="auth-logo-image" decoding="async" src={authLogoSrc} /> : null}
            </div>
            <p className="auth-tagline">Securing your digital frontier</p>
          </div>

          <motion.article
            className="auth-card auth-card-stitch"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {mode === 'login' && (
                <form className="auth-form auth-form-stitch" onSubmit={handleLogin}>
                  <div className="auth-field-group">
                    <label className="auth-field-label">Username</label>
                    <label className="auth-field auth-field-user">
                      <span className="sr-only">Username or Email</span>
                      <input
                        placeholder="Username"
                        value={login.identifier}
                        onChange={(e) => setLogin((state) => ({ ...state, identifier: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="auth-field-group">
                    <div className="auth-field-header">
                      <label className="auth-field-label">Password</label>
                      <button className="auth-link-button" onClick={handleForgotPassword} type="button">
                        Forgot password?
                      </button>
                    </div>
                    <label className="auth-field auth-field-lock">
                      <span className="sr-only">Password</span>
                      <input
                        type={authPasswordVisible ? 'text' : 'password'}
                        placeholder="Password"
                        value={login.password}
                        onChange={(e) => setLogin((state) => ({ ...state, password: e.target.value }))}
                      />
                      <button
                        aria-label={authPasswordVisible ? 'Hide password' : 'Show password'}
                        className="auth-visibility-toggle"
                        onClick={() => setAuthPasswordVisible((current) => !current)}
                        type="button"
                      >
                        {authPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </label>
                  </div>

                  {authFeedback}

                  <button className="primary-button auth-primary-button" disabled={busy} type="submit">
                    {busy ? 'Signing in...' : 'Log In'}
                  </button>

                  <div className="auth-separator">Or</div>

                  <div className="auth-social-grid">
                    <button className="auth-social-button" onClick={() => handleSocialAuthClick('google')} type="button">
                      Google
                    </button>
                    <button className="auth-social-button auth-social-button-dark" onClick={() => handleSocialAuthClick('apple')} type="button">
                      Apple
                    </button>
                  </div>
                </form>
              )}

              {mode === 'signup' && (
                <form className="auth-form auth-form-stitch" onSubmit={handleSignup}>
                  <div className="auth-field-group">
                    <label className="auth-field-label">Username</label>
                    <label className="auth-field auth-field-user">
                      <span className="sr-only">Username</span>
                      <input
                        value={signup.username}
                        placeholder="Username"
                        onChange={(e) => setSignup((state) => ({ ...state, username: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="auth-field-group">
                    <label className="auth-field-label">Email</label>
                    <label className="auth-field auth-field-mail">
                      <span className="sr-only">Email</span>
                      <input
                        type="email"
                        placeholder="Email"
                        value={signup.email}
                        onChange={(e) => setSignup((state) => ({ ...state, email: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="auth-field-group">
                    <div className="auth-field-header">
                      <label className="auth-field-label">Password</label>
                      <button className="auth-link-button" onClick={() => setAuthPasswordVisible((current) => !current)} type="button">
                        {authPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <label className="auth-field auth-field-lock">
                      <span className="sr-only">Password</span>
                      <input
                        type={authPasswordVisible ? 'text' : 'password'}
                        placeholder="Password"
                        value={signup.password}
                        onChange={(e) => setSignup((state) => ({ ...state, password: e.target.value }))}
                      />
                    </label>
                  </div>

                  <p className="auth-device-copy">Trusted device: {deviceProfile.deviceName}</p>

                  {authFeedback}

                  <button className="primary-button auth-primary-button" disabled={busy} type="submit">
                    {busy ? 'Creating account...' : 'Create account'}
                  </button>
                </form>
              )}

              {mode === 'verify' && (
                <form className="auth-form auth-form-stitch" onSubmit={handleVerify}>
                  <div className="auth-field-group">
                    <label className="auth-field-label">Verification email</label>
                    <label className="auth-field auth-field-mail">
                      <span className="sr-only">Verification email</span>
                      <input
                        type="email"
                        placeholder="Email"
                        value={verificationEmail}
                        onChange={(e) => setVerificationEmail(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="auth-field-group">
                    <div className="auth-field-header">
                      <label className="auth-field-label">Verification code</label>
                      <button className="auth-link-button" disabled={busy} onClick={() => void handleResendVerification()} type="button">
                        Resend code
                      </button>
                    </div>
                    <label className="auth-field auth-field-code">
                      <span className="sr-only">Verification code</span>
                      <input
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                    </label>
                  </div>

                  {authFeedback}

                  <button className="primary-button auth-primary-button" disabled={busy} type="submit">
                    {busy ? 'Verifying...' : 'Verify code'}
                  </button>
                </form>
              )}

              {mode === 'reset' && (
                <form className="auth-form auth-form-stitch" onSubmit={handleResetPassword}>
                  <div className="auth-field-group">
                    <div className="auth-field-header">
                      <label className="auth-field-label">Email</label>
                      <button className="auth-link-button" disabled={busy} onClick={() => void handleRequestPasswordReset()} type="button">
                        Send code
                      </button>
                    </div>
                    <label className="auth-field auth-field-mail">
                      <span className="sr-only">Email</span>
                      <input
                        type="email"
                        placeholder="Email"
                        value={resetPasswordForm.email}
                        onChange={(e) => setResetPasswordForm((state) => ({ ...state, email: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="auth-field-group">
                    <label className="auth-field-label">Reset code</label>
                    <label className="auth-field auth-field-code">
                      <span className="sr-only">Reset code</span>
                      <input
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        value={resetPasswordForm.code}
                        onChange={(e) =>
                          setResetPasswordForm((state) => ({ ...state, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))
                        }
                      />
                    </label>
                  </div>

                  <div className="auth-field-group">
                    <div className="auth-field-header">
                      <label className="auth-field-label">New password</label>
                      <button className="auth-link-button" onClick={() => setResetPasswordVisible((current) => !current)} type="button">
                        {resetPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <label className="auth-field auth-field-lock">
                      <span className="sr-only">New password</span>
                      <input
                        type={resetPasswordVisible ? 'text' : 'password'}
                        placeholder="New password"
                        value={resetPasswordForm.newPassword}
                        onChange={(e) => setResetPasswordForm((state) => ({ ...state, newPassword: e.target.value }))}
                      />
                    </label>
                  </div>

                  {authFeedback}

                  <button className="primary-button auth-primary-button" disabled={busy} type="submit">
                    {busy ? 'Resetting...' : 'Reset password'}
                  </button>
                </form>
              )}

              <div className="auth-footer-cta">
                {mode === 'login' ? (
                  <>
                    <p className="auth-switch-copy">Don&apos;t have an account?</p>
                    <button className="auth-outline-button" onClick={() => setMode('signup')} type="button">
                      Create account
                    </button>
                  </>
                ) : mode === 'signup' ? (
                  <>
                    <p className="auth-switch-copy">Already have an account?</p>
                    <button className="auth-outline-button" onClick={() => setMode('login')} type="button">
                      Log in
                    </button>
                  </>
                ) : mode === 'reset' ? (
                  <>
                    <p className="auth-switch-copy">Remembered your password?</p>
                    <button className="auth-outline-button" onClick={() => setMode('login')} type="button">
                      Back to login
                    </button>
                  </>
                ) : (
                  <>
                    <p className="auth-switch-copy">Back to your secure sign-in</p>
                    <button className="auth-outline-button" onClick={() => setMode('login')} type="button">
                      Log in
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.article>
        </section>
      ) : (
        <section className="app-shell">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <KrynoMobileApp
                activeConversationKey={activeConversationKey}
                attachmentDraft={attachmentDraft}
                attachmentViewer={attachmentViewer}
                busy={busy}
                callState={callState}
                callHistory={callHistory}
                conversationTimeline={getConversationTimeline(messages, callHistory)}
                conversationSummaries={conversationSummaries}
                error={error}
                localCallStream={localCallStream}
                messageDraft={messageDraft}
                messages={messages}
                notice={notice}
                postCommentDrafts={socialCommentDrafts}
                postComposer={postComposer}
                profileForm={profileForm}
                onAttachmentSelected={handleAttachmentSelected}
                onAcceptCall={() => void handleAcceptCall()}
                onAddPostComment={(postId) => void handleAddPostComment(postId)}
                onCloseAttachmentPreview={closeAttachmentViewer}
                onClearSelectedThread={handleClearSelectedThread}
                onCreatePost={handleCreatePost}
                onCreateStory={handleCreateStory}
                onDeletePost={(post) => void handleDeletePost(post)}
                onDownloadAttachmentPreview={downloadAttachmentViewer}
                onEndCall={handleEndCall}
                onOpenStory={(storyId) => void handleOpenStory(storyId)}
                onLogout={handleLogout}
                onMessageDraftChange={setMessageDraft}
                onOpenAttachment={(message) => void handleOpenAttachment(message)}
                onPostComposerChange={setPostComposer}
                onPostCommentDraftChange={handlePostCommentChange}
                onPostMediaSelected={handlePostMediaSelected}
                onProfileAvatarSelected={handleProfileAvatarSelected}
                onProfileFormChange={setProfileForm}
                onRecipientLookupChange={setRecipientLookup}
                onRefresh={handleRefresh}
                onRejectCall={handleRejectCall}
                onSaveProfile={handleSaveProfile}
                onSelectThread={handleSelectThread}
                onSendAttachment={() => void handleSendAttachment()}
                onSendMessage={handleSendMessage}
                onSilenceRingtone={handleSilenceRingtone}
                onStartAudioCall={() => void handleStartCall('audio')}
                onStartVideoCall={() => void handleStartCall('video')}
                onStoryComposerChange={setStoryComposer}
                onStoryMediaSelected={handleStoryMediaSelected}
                onToggleCallMute={handleToggleCallMute}
                onToggleCamera={handleToggleCamera}
                onToggleFollow={(profile) => void handleToggleFollow(profile)}
                onTogglePostLike={(post) => void handleTogglePostLike(post)}
                onToggleSpeakerMute={handleToggleSpeakerMute}
                recipientLookup={recipientLookup}
                recipientResults={recipientResults}
                recipientSearchBusy={recipientSearchBusy}
                relayStatus={relayStatus}
                remoteCallStream={remoteCallStream}
                selectedConversation={selectedConversation}
                session={session}
                signalReady={signalReady}
                postBusy={postBusy}
                profileBusy={profileBusy}
                storyBusy={storyBusy}
                socialFeed={socialBootstrap?.feed ?? []}
                socialMe={socialBootstrap?.me ?? null}
                socialStories={socialBootstrap?.stories ?? []}
                socialSuggestions={socialBootstrap?.suggestions ?? []}
                followBusyUsers={followBusyUsers}
                storyComposer={storyComposer}
              />
          </motion.div>
        </section>
      )}
    </main>
  );
}
