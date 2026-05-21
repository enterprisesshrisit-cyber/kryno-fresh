export type CallMode = 'audio' | 'video';

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

export type RuntimeIceConfig = {
  iceServers: RTCIceServer[];
  hasDedicatedTurn: boolean;
  hasDedicatedStun: boolean;
};

export type ClientRelayCommand =
  | {
      type: 'call_invite';
      callId: string;
      recipientLookup: string;
      mode: CallMode;
    }
  | {
      type: 'call_accept';
      callId: string;
    }
  | {
      type: 'call_reject';
      callId: string;
      reason?: string;
    }
  | {
      type: 'call_end';
      callId: string;
      reason?: string;
    }
  | {
      type: 'call_signal';
      callId: string;
      targetSessionId: string;
      signal:
        | {
            type: 'offer' | 'answer';
            sdp: string;
          }
        | {
            type: 'ice-candidate';
            candidate: RTCIceCandidateInit;
          };
    };

export type RelayCallEvent =
  | {
      type: 'call_invite';
      callId: string;
      mode: CallMode;
      callerSessionId: string;
      callerUserId: string;
      callerUsername: string;
    }
  | {
      type: 'call_ringing';
      callId: string;
      recipientUserId: string;
      recipientUsername: string;
      mode: CallMode;
    }
  | {
      type: 'call_unavailable';
      callId: string;
      reason: string;
    }
  | {
      type: 'call_accepted';
      callId: string;
      peerSessionId: string;
    }
  | {
      type: 'call_join';
      callId: string;
      peerSessionId: string;
    }
  | {
      type: 'call_rejected';
      callId: string;
      reason: string;
      bySessionId: string;
    }
  | {
      type: 'call_ended';
      callId: string;
      reason: string;
      endedBySessionId: string | null;
    }
  | {
      type: 'call_signal';
      callId: string;
      fromSessionId: string;
      signal:
        | {
            type: 'offer' | 'answer';
            sdp: string;
          }
        | {
            type: 'ice-candidate';
            candidate: RTCIceCandidateInit;
          };
    };

type TonePattern = 'incoming' | 'outgoing';

function parseIceServerUrls(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveIceServers() {
  const env = (import.meta as ImportMetaWithEnv).env ?? {};
  const stunUrls = parseIceServerUrls(env.VITE_KRYNO_STUN_URLS);
  const turnUrls = parseIceServerUrls(env.VITE_KRYNO_TURN_URLS);
  const turnUsername = env.VITE_KRYNO_TURN_USERNAME?.trim();
  const turnCredential = env.VITE_KRYNO_TURN_CREDENTIAL?.trim();

  const iceServers: RTCIceServer[] = [];

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  } else {
    iceServers.push({
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:openrelay.metered.ca:80']
    });
  }

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential
    });
  } else {
    iceServers.push({
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    });
  }

  return iceServers;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = resolveIceServers();
let runtimeIceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS;

export function getFallbackIceServers() {
  return DEFAULT_ICE_SERVERS;
}

export function setRuntimeIceServers(iceServers: RTCIceServer[] | null | undefined) {
  runtimeIceServers = iceServers && iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
}

export async function requestCallMedia(mode: CallMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot start microphone/camera capture.');
  }

  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mode === 'video'
  });
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function setMicrophoneMuted(stream: MediaStream | null, muted: boolean) {
  stream
    ?.getAudioTracks()
    .forEach((track) => {
      track.enabled = !muted;
    });
}

export function setCameraEnabled(stream: MediaStream | null, enabled: boolean) {
  stream
    ?.getVideoTracks()
    .forEach((track) => {
      track.enabled = enabled;
    });
}

export function createCallPeerConnection(handlers: {
  localStream: MediaStream;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}) {
  const peer = new RTCPeerConnection({
    iceServers: runtimeIceServers,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  });

  for (const track of handlers.localStream.getTracks()) {
    peer.addTrack(track, handlers.localStream);
  }

  const remoteStream = new MediaStream();

  peer.addEventListener('track', (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });
    handlers.onRemoteStream(remoteStream);
  });

  peer.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      handlers.onIceCandidate(event.candidate.toJSON());
    }
  });

  peer.addEventListener('connectionstatechange', () => {
    handlers.onConnectionStateChange(peer.connectionState);
  });

  peer.addEventListener('iceconnectionstatechange', () => {
    handlers.onIceConnectionStateChange?.(peer.iceConnectionState);
  });

  return peer;
}

export class ToneController {
  private audioContext: AudioContext | null = null;
  private intervalId: number | null = null;

  constructor() {
    const unlock = () => {
      void this.ensureContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private async ensureContext() {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextCtor();
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        return null;
      }
    }

    return this.audioContext;
  }

  private beep(context: AudioContext, frequency: number, durationMs: number, gainValue: number) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000 + 0.02);
  }

  async play(pattern: TonePattern) {
    const context = await this.ensureContext();
    if (!context) {
      return;
    }

    this.stop();

    const sequence = () => {
      if (pattern === 'incoming') {
        this.beep(context, 720, 180, 0.04);
        window.setTimeout(() => this.beep(context, 540, 240, 0.03), 180);
      } else {
        this.beep(context, 420, 320, 0.025);
      }
    };

    sequence();
    this.intervalId = window.setInterval(sequence, pattern === 'incoming' ? 1400 : 1800);
  }

  stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
