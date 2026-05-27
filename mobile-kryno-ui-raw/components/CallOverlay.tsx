import React, { useEffect, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { RTCView } from '@livekit/react-native-webrtc';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useConnectionState,
  useTracks
} from '@livekit/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ConnectionState, Track } from 'livekit-client';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS } from '../lib/theme';
import { useKrynoBackend } from '../lib/krynoBackend';

function LiveKitStage({
  mode,
  muted,
  cameraEnabled,
  onTransportState
}: {
  mode: 'audio' | 'video';
  muted: boolean;
  cameraEnabled: boolean;
  onTransportState: (input: { phase?: 'connecting' | 'connected'; status: string; connectedAt?: string }) => void;
}) {
  const connectionState = useConnectionState();
  const tracks = useTracks([Track.Source.Camera]);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      onTransportState({
        phase: 'connected',
        status: mode === 'video' ? 'Video call live.' : 'Audio call live.',
        connectedAt: new Date().toISOString()
      });
      return;
    }

    if (connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting) {
      onTransportState({
        phase: 'connecting',
        status: connectionState === ConnectionState.Reconnecting ? 'Reconnecting media...' : 'Connecting media...'
      });
    }
  }, [connectionState, mode, onTransportState]);

  const trackRefs = useMemo(() => tracks.filter(isTrackReference), [tracks]);
  const remoteTrack = trackRefs.find((trackRef: any) => !trackRef.participant?.isLocal);
  const localTrack = trackRefs.find((trackRef: any) => trackRef.participant?.isLocal);

  if (mode === 'audio') {
    return (
      <View style={styles.audioStage}>
        <View style={styles.audioPulse}>
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={38} color={COLORS.text} />
        </View>
        <Text style={styles.stageTitle}>Audio connected through LiveKit</Text>
      </View>
    );
  }

  return (
    <View style={styles.videoStage}>
      {remoteTrack ? (
        <VideoTrack trackRef={remoteTrack} style={styles.remoteVideo} />
      ) : (
        <View style={styles.remoteWaiting}>
          <Ionicons name="videocam" size={42} color={COLORS.textMuted} />
          <Text style={styles.waitingText}>Waiting for remote video...</Text>
        </View>
      )}

      <View style={styles.localPip}>
        {localTrack && cameraEnabled ? (
          <VideoTrack trackRef={localTrack} style={styles.localVideo} mirror />
        ) : (
          <View style={styles.localCameraOff}>
            <Ionicons name="videocam-off" size={20} color={COLORS.textMuted} />
          </View>
        )}
      </View>
    </View>
  );
}

function WebRtcStage({
  mode,
  localUrl,
  remoteUrl,
  cameraEnabled
}: {
  mode: 'audio' | 'video';
  localUrl: string | null;
  remoteUrl: string | null;
  cameraEnabled: boolean;
}) {
  if (mode === 'audio') {
    return (
      <View style={styles.audioStage}>
        <View style={styles.audioPulse}>
          <Ionicons name="call" size={38} color={COLORS.text} />
        </View>
        <Text style={styles.stageTitle}>Audio call using fallback relay</Text>
      </View>
    );
  }

  return (
    <View style={styles.videoStage}>
      {remoteUrl ? (
        <RTCView streamURL={remoteUrl} style={styles.remoteVideo} objectFit="cover" />
      ) : (
        <View style={styles.remoteWaiting}>
          <Ionicons name="videocam" size={42} color={COLORS.textMuted} />
          <Text style={styles.waitingText}>Waiting for remote video...</Text>
        </View>
      )}

      <View style={styles.localPip}>
        {localUrl && cameraEnabled ? (
          <RTCView streamURL={localUrl} style={styles.localVideo} objectFit="cover" mirror />
        ) : (
          <View style={styles.localCameraOff}>
            <Ionicons name="videocam-off" size={20} color={COLORS.textMuted} />
          </View>
        )}
      </View>
    </View>
  );
}

export default function CallOverlay() {
  const {
    currentCall,
    localCallStreamUrl,
    remoteCallStreamUrl,
    acceptCurrentCall,
    rejectCurrentCall,
    endCurrentCall,
    toggleCurrentCallMute,
    toggleCurrentCallCamera,
    updateCurrentCallTransport
  } = useKrynoBackend();

  useEffect(() => {
    if (!currentCall) {
      return;
    }

    void AudioSession.startAudioSession().catch(() => undefined);
    return () => {
      void AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [currentCall?.callId]);

  if (!currentCall) {
    return null;
  }

  const liveKitReady =
    currentCall.mediaProvider === 'livekit' &&
    currentCall.liveKitToken &&
    (currentCall.phase === 'connecting' || currentCall.phase === 'connected');

  const modeIcon = currentCall.mode === 'video' ? 'videocam' : 'call';
  const directionLabel = currentCall.direction === 'incoming' ? 'Incoming' : 'Calling';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void endCurrentCall('dismissed')}>
      <View style={styles.backdrop}>
        <LinearGradient colors={['rgba(7,9,18,0.98)', 'rgba(13,17,31,0.96)']} style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Ionicons name={modeIcon as any} size={28} color={COLORS.text} />
            </View>
            <Text style={styles.kicker}>{directionLabel} {currentCall.mode} call</Text>
            <Text style={styles.name}>{currentCall.remoteLabel}</Text>
            <Text style={styles.status}>{currentCall.status}</Text>
          </View>

          <View style={styles.stage}>
            {liveKitReady ? (
              <LiveKitRoom
                serverUrl={currentCall.liveKitToken!.url}
                token={currentCall.liveKitToken!.token}
                connect
                audio={!currentCall.muted}
                video={currentCall.mode === 'video' && currentCall.cameraEnabled}
                options={{ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }}
              >
                <LiveKitStage
                  mode={currentCall.mode}
                  muted={currentCall.muted}
                  cameraEnabled={currentCall.cameraEnabled}
                  onTransportState={updateCurrentCallTransport}
                />
              </LiveKitRoom>
            ) : (
              <WebRtcStage
                mode={currentCall.mode}
                localUrl={localCallStreamUrl}
                remoteUrl={remoteCallStreamUrl}
                cameraEnabled={currentCall.cameraEnabled}
              />
            )}
          </View>

          <View style={styles.controls}>
            {currentCall.direction === 'incoming' && currentCall.phase === 'ringing' ? (
              <>
                <Pressable style={[styles.roundButton, styles.reject]} onPress={() => void rejectCurrentCall('declined')}>
                  <Ionicons name="call" size={24} color="#fff" style={styles.hangupIcon} />
                </Pressable>
                <Pressable style={[styles.roundButton, styles.accept]} onPress={() => void acceptCurrentCall()}>
                  <Ionicons name={modeIcon as any} size={24} color="#fff" />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.roundButton} onPress={toggleCurrentCallMute}>
                  <Ionicons name={currentCall.muted ? 'mic-off' : 'mic'} size={22} color={COLORS.text} />
                </Pressable>
                {currentCall.mode === 'video' && (
                  <Pressable style={styles.roundButton} onPress={toggleCurrentCallCamera}>
                    <Ionicons name={currentCall.cameraEnabled ? 'videocam' : 'videocam-off'} size={22} color={COLORS.text} />
                  </Pressable>
                )}
                <Pressable style={[styles.roundButton, styles.reject]} onPress={() => void endCurrentCall('ended')}>
                  <Ionicons name="call" size={24} color="#fff" style={styles.hangupIcon} />
                </Pressable>
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 18
  },
  panel: {
    minHeight: '74%',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden'
  },
  header: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 14
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.42)',
    marginBottom: 12
  },
  kicker: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: FONTS.semibold,
    textTransform: 'uppercase'
  },
  name: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: FONTS.bold,
    marginTop: 4
  },
  status: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6
  },
  stage: {
    flex: 1,
    minHeight: 320,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#070a12',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)'
  },
  audioStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18
  },
  audioPulse: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.44)'
  },
  stageTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: FONTS.semibold
  },
  videoStage: {
    flex: 1
  },
  remoteVideo: {
    flex: 1
  },
  remoteWaiting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  waitingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: FONTS.medium
  },
  localPip: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 108,
    height: 148,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)'
  },
  localVideo: {
    flex: 1
  },
  localCameraOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    paddingTop: 18,
    paddingBottom: 4
  },
  roundButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)'
  },
  accept: {
    backgroundColor: '#12b76a',
    borderColor: 'rgba(255,255,255,0.18)'
  },
  reject: {
    backgroundColor: '#ef4444',
    borderColor: 'rgba(255,255,255,0.18)'
  },
  hangupIcon: {
    transform: [{ rotate: '135deg' }]
  }
});
