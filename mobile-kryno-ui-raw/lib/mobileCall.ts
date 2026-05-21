export type MobileCallMode = 'audio' | 'video';

export type MobileIceConfig = {
  iceServers: RTCIceServer[];
  hasDedicatedTurn: boolean;
  hasDedicatedStun: boolean;
};

type WebRTCModule = {
  mediaDevices: {
    getUserMedia: (constraints: Record<string, unknown>) => Promise<any>;
  };
  MediaStream: new () => any;
  RTCPeerConnection: new (config: Record<string, unknown>) => any;
  RTCIceCandidate: new (candidate: RTCIceCandidateInit) => any;
  RTCSessionDescription: new (description: { type: 'offer' | 'answer'; sdp: string }) => any;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

let runtimeIceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;

function getWebRTC(): WebRTCModule {
  return require('@livekit/react-native-webrtc') as WebRTCModule;
}

export function setMobileRuntimeIceServers(iceServers: RTCIceServer[] | null | undefined) {
  runtimeIceServers = iceServers && iceServers.length > 0 ? iceServers : FALLBACK_ICE_SERVERS;
}

export function getMobileFallbackIceServers() {
  return FALLBACK_ICE_SERVERS;
}

export async function requestMobileCallMedia(mode: MobileCallMode) {
  const { mediaDevices } = getWebRTC();
  return mediaDevices.getUserMedia({
    audio: true,
    video:
      mode === 'video'
        ? {
            facingMode: 'user',
            frameRate: 24
          }
        : false
  });
}

export function stopMobileMediaStream(stream: any | null) {
  stream?.getTracks().forEach((track: any) => track.stop());
}

export function setMobileMicrophoneMuted(stream: any | null, muted: boolean) {
  stream?.getAudioTracks().forEach((track: any) => {
    track.enabled = !muted;
  });
}

export function setMobileCameraEnabled(stream: any | null, enabled: boolean) {
  stream?.getVideoTracks().forEach((track: any) => {
    track.enabled = enabled;
  });
}

export function createMobileCallPeerConnection(handlers: {
  localStream: any;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: any) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}) {
  const { RTCPeerConnection, MediaStream } = getWebRTC();
  const peer = new RTCPeerConnection({
    iceServers: runtimeIceServers,
    bundlePolicy: 'max-bundle'
  });
  const peerAny = peer as any;

  handlers.localStream.getTracks().forEach((track: any) => {
    peer.addTrack(track, handlers.localStream);
  });

  const remoteStream = new MediaStream();

  peerAny.ontrack = (event: any) => {
    event.streams[0]?.getTracks().forEach((track: any) => {
      if (!remoteStream.getTracks().some((existing: any) => existing.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });
    handlers.onRemoteStream(remoteStream);
  };

  peerAny.onicecandidate = (event: any) => {
    if (event.candidate) {
      handlers.onIceCandidate(event.candidate.toJSON());
    }
  };

  peerAny.onconnectionstatechange = () => {
    handlers.onConnectionStateChange(peer.connectionState);
  };

  peerAny.oniceconnectionstatechange = () => {
    handlers.onIceConnectionStateChange?.(peer.iceConnectionState);
  };

  return peer;
}

export async function applyMobileOffer(peer: any, sdp: string) {
  const { RTCSessionDescription } = getWebRTC();
  await peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  return answer;
}

export async function applyMobileAnswer(peer: any, sdp: string) {
  const { RTCSessionDescription } = getWebRTC();
  await peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
}

export async function addMobileIceCandidate(peer: any, candidate: RTCIceCandidateInit) {
  const { RTCIceCandidate } = getWebRTC();
  await peer.addIceCandidate(new RTCIceCandidate(candidate));
}
