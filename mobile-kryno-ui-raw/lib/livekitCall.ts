import { AudioSession } from '@livekit/react-native';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import type { RemoteParticipant, RemoteTrack, RemoteTrackPublication } from 'livekit-client';
import type { MobileCallMode } from './mobileCall';

type ConnectLiveKitCallInput = {
  url: string;
  token: string;
  mode: MobileCallMode;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onRemoteTrackSubscribed?: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => void;
  onDisconnected?: () => void;
};

export type KrynoLiveKitCallSession = {
  room: Room;
  setMuted: (muted: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
};

export async function connectKrynoLiveKitCall(input: ConnectLiveKitCallInput): Promise<KrynoLiveKitCallSession> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    input.onConnectionStateChange?.(state);
  });

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    input.onRemoteTrackSubscribed?.(track, publication, participant);
  });

  room.on(RoomEvent.Disconnected, () => {
    void AudioSession.stopAudioSession().catch(() => undefined);
    input.onDisconnected?.();
  });

  await AudioSession.startAudioSession();
  await room.connect(input.url, input.token, {
    autoSubscribe: true
  });
  await room.localParticipant.setMicrophoneEnabled(true);
  await room.localParticipant.setCameraEnabled(input.mode === 'video');

  return {
    room,
    setMuted: async (muted: boolean) => {
      await room.localParticipant.setMicrophoneEnabled(!muted);
    },
    setCameraEnabled: async (enabled: boolean) => {
      await room.localParticipant.setCameraEnabled(enabled);
    },
    disconnect: async () => {
      await room.disconnect(true);
      await AudioSession.stopAudioSession().catch(() => undefined);
    }
  };
}
