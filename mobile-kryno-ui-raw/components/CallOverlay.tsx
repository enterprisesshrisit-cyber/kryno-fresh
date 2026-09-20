import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView } from '@livekit/react-native';
import type { Room, VideoTrack as LiveVideoTrack } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../lib/theme';
import { useKrynoBackend } from '../lib/krynoBackend';

type LiveCallSession = {
  room: Room;
  setMuted: (muted: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
};

function localCameraTrack(room: Room): LiveVideoTrack | null {
  const publication = Array.from(room.localParticipant.videoTrackPublications.values()).find(
    (entry) => entry.source === 'camera'
  );
  return (publication?.track as LiveVideoTrack | undefined) ?? null;
}

function phaseFromLiveKitState(state: unknown) {
  const value = String(state).toLowerCase();

  if (value === 'connected') {
    return 'connected' as const;
  }

  if (value === 'connecting' || value === 'reconnecting') {
    return 'connecting' as const;
  }

  return undefined;
}

function statusFromPhase(mode: 'audio' | 'video', phase?: 'connecting' | 'connected') {
  if (phase === 'connected') {
    return mode === 'video' ? 'Video call live.' : 'Audio call live.';
  }

  if (phase === 'connecting') {
    return 'Connecting call media...';
  }

  return 'Preparing call media...';
}

function safeCallMediaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/refresh token reuse|invalid refresh token|access token expired|refresh token expired|please refresh your session/i.test(message)) {
    return 'Session expired, please login again.';
  }
  if (/livekit|websocket|network|timeout|failed to connect/i.test(message)) {
    return 'Call media could not connect. Check network and try again.';
  }
  return message || 'Unable to connect call media.';
}

export default function CallOverlay() {
  const insets = useSafeAreaInsets();
  const {
    currentCall,
    acceptCurrentCall,
    rejectCurrentCall,
    endCurrentCall,
    toggleCurrentCallMute,
    toggleCurrentCallCamera,
    updateCurrentCallTransport
  } = useKrynoBackend();
  const liveSessionRef = useRef<LiveCallSession | null>(null);
  const liveSessionCallIdRef = useRef<string | null>(null);
  const currentCallRef = useRef(currentCall);
  currentCallRef.current = currentCall;
  const [mediaError, setMediaError] = useState('');
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<LiveVideoTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<LiveVideoTrack | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const ensureIncomingPermissions = async () => {
    if (!currentCall || Platform.OS !== 'android') {
      return true;
    }

    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (currentCall.mode === 'video') {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    const result = await PermissionsAndroid.requestMultiple(permissions);
    const granted = permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
    if (!granted) {
      Alert.alert('Call permission needed', 'Allow microphone and camera permissions to answer this call.');
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (!currentCall) {
      liveSessionCallIdRef.current = null;
      setMediaError('');
      setRemoteVideoTrack(null);
      setLocalVideoTrack(null);
      void liveSessionRef.current?.disconnect().catch(() => undefined);
      liveSessionRef.current = null;
      return;
    }

    if (
      currentCall.mediaProvider !== 'livekit' ||
      !currentCall.liveKitToken ||
      (currentCall.phase !== 'connecting' && currentCall.phase !== 'connected')
    ) {
      return;
    }

    if (liveSessionRef.current && liveSessionCallIdRef.current === currentCall.callId) {
      return;
    }

    let cancelled = false;
    const callId = currentCall.callId;
    const token = currentCall.liveKitToken;
    const mode = currentCall.mode;

    void liveSessionRef.current?.disconnect().catch(() => undefined);
    liveSessionRef.current = null;
    liveSessionCallIdRef.current = callId;
    setMediaError('');
    setRemoteVideoTrack(null);
    setLocalVideoTrack(null);
    updateCurrentCallTransport({
      phase: 'connecting',
      status: 'Connecting LiveKit media transport...'
    });
    console.log('[KrynoCall] livekit connect start', {
      callId,
      mode
    });

    void import('../lib/livekitCall')
      .then(({ connectKrynoLiveKitCall }) =>
        connectKrynoLiveKitCall({
          url: token.url,
          token: token.token,
          mode,
          onConnectionStateChange: (state) => {
            const phase = phaseFromLiveKitState(state);
            console.log('[KrynoCall] livekit connection state', {
              callId,
              state: String(state)
            });
            if (!phase || cancelled) {
              return;
            }

            updateCurrentCallTransport({
              phase,
              status: statusFromPhase(mode, phase),
              connectedAt: phase === 'connected' ? new Date().toISOString() : undefined
            });
          },
          onDisconnected: () => {
            if (!cancelled) {
              setRemoteVideoTrack(null);
              setLocalVideoTrack(null);
              setMediaError('Call disconnected. Try reconnecting.');
              liveSessionRef.current = null;
              updateCurrentCallTransport({
                phase: 'connecting',
                status: 'Call media disconnected.'
              });
            }
          },
          onRemoteTrackSubscribed: (track) => {
            if (!cancelled && track.kind === 'video') {
              setRemoteVideoTrack(track as LiveVideoTrack);
            }
          },
          onRemoteTrackUnsubscribed: (track) => {
            if (!cancelled && track.kind === 'video') {
              setRemoteVideoTrack((current) => current === track ? null : current);
            }
          }
        })
      )
      .then(async (session) => {
        if (cancelled) {
          await session.disconnect().catch(() => undefined);
          return;
        }

        liveSessionRef.current = session;
        const latestCall = currentCallRef.current;
        if (!latestCall || latestCall.callId !== callId) {
          await session.disconnect().catch(() => undefined);
          liveSessionRef.current = null;
          return;
        }
        await session.setMuted(latestCall.muted).catch(() => undefined);
        if (mode === 'video') {
          await session.setCameraEnabled(latestCall.cameraEnabled).catch(() => undefined);
          setLocalVideoTrack(localCameraTrack(session.room));
        }
        console.log('[KrynoCall] livekit session ready', {
          callId,
          mode
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        const message = safeCallMediaError(error);
        console.log('[KrynoCall] livekit connect failed', {
          callId,
          message
        });
        setMediaError(message);
        updateCurrentCallTransport({
          status: `Call media failed: ${message}`
        });
      });

    return () => {
      cancelled = true;
      if (liveSessionCallIdRef.current === callId) {
        void liveSessionRef.current?.disconnect().catch(() => undefined);
        liveSessionRef.current = null;
        liveSessionCallIdRef.current = null;
      }
      setRemoteVideoTrack(null);
      setLocalVideoTrack(null);
    };
  }, [
    currentCall?.callId,
    currentCall?.liveKitToken?.token,
    currentCall?.liveKitToken?.url,
    currentCall?.mediaProvider,
    currentCall?.mode,
    connectionAttempt,
    updateCurrentCallTransport
  ]);

  useEffect(() => {
    const session = liveSessionRef.current;
    if (!session || !currentCall || liveSessionCallIdRef.current !== currentCall.callId) {
      return;
    }

    void session.setMuted(currentCall.muted).catch(() => undefined);
    if (currentCall.mode === 'video') {
      void session.setCameraEnabled(currentCall.cameraEnabled)
        .then(() => setLocalVideoTrack(localCameraTrack(session.room)))
        .catch(() => undefined);
    }
  }, [currentCall?.callId, currentCall?.cameraEnabled, currentCall?.mode, currentCall?.muted]);

  if (!currentCall) {
    return null;
  }

  const modeIcon = currentCall.mode === 'video' ? 'videocam' : 'call';
  const directionLabel = currentCall.direction === 'incoming' ? 'Incoming' : 'Calling';
  const stageTitle =
    currentCall.phase === 'connected'
      ? currentCall.mode === 'video'
        ? 'Video call connected'
        : 'Audio call connected'
      : currentCall.phase === 'connecting'
        ? 'Connecting secure media'
        : currentCall.direction === 'incoming'
          ? 'Answer incoming call'
          : 'Ringing...';
  const stageSubtitle =
    currentCall.phase === 'connected'
      ? 'Connected'
      : currentCall.phase === 'connecting'
        ? 'Connecting...'
        : currentCall.direction === 'incoming'
          ? 'Incoming call'
          : 'Waiting for answer';
  const stageIcon =
    currentCall.phase === 'connected'
      ? currentCall.mode === 'video'
        ? 'videocam'
        : 'volume-high'
      : currentCall.mode === 'video'
        ? 'videocam-outline'
        : 'call-outline';

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => void endCurrentCall('dismissed')}>
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 20) }]}>
        <LinearGradient colors={['rgba(7,9,18,0.98)', 'rgba(13,17,31,0.96)']} style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Ionicons name={modeIcon as any} size={28} color={COLORS.text} />
            </View>
            <Text style={styles.kicker}>{directionLabel} {currentCall.mode} call</Text>
            <Text style={styles.name}>{currentCall.remoteLabel}</Text>
            <Text style={styles.status}>{mediaError || currentCall.status}</Text>
          </View>

          <View style={styles.stage}>
            {currentCall.mode === 'video' && remoteVideoTrack && (
              <VideoView videoTrack={remoteVideoTrack} style={styles.remoteVideo} objectFit="cover" />
            )}
            {!remoteVideoTrack && (
              <>
                <View style={styles.mediaOrb}>
                  <Ionicons name={stageIcon as any} size={52} color={COLORS.text} />
                </View>
                <Text style={styles.stageTitle}>{stageTitle}</Text>
                <Text style={styles.stageSub}>{stageSubtitle}</Text>
              </>
            )}
            {currentCall.mode === 'video' && currentCall.cameraEnabled && localVideoTrack && (
              <VideoView videoTrack={localVideoTrack} style={styles.localVideo} objectFit="cover" mirror zOrder={1} />
            )}
            {mediaError && currentCall.liveKitToken && (
              <Pressable
                style={styles.retryButton}
                accessibilityRole="button"
                accessibilityLabel="Retry call connection"
                onPress={() => {
                  setMediaError('');
                  setConnectionAttempt((attempt) => attempt + 1);
                }}
              >
                <Ionicons name="refresh" size={19} color={COLORS.text} />
                <Text style={styles.retryText}>Retry connection</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.controls}>
            {currentCall.direction === 'incoming' && currentCall.phase === 'ringing' ? (
              <>
                <Pressable style={[styles.roundButton, styles.reject]} accessibilityRole="button" accessibilityLabel="Decline call" onPress={() => void rejectCurrentCall('declined')}>
                  <Ionicons name="call" size={24} color="#fff" style={styles.hangupIcon} />
                </Pressable>
                <Pressable
                  style={[styles.roundButton, styles.accept]}
                  accessibilityRole="button"
                  accessibilityLabel="Answer call"
                  onPress={async () => {
                    if (await ensureIncomingPermissions()) {
                      await acceptCurrentCall();
                    }
                  }}
                >
                  <Ionicons name={modeIcon as any} size={24} color="#fff" />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.roundButton} accessibilityRole="button" accessibilityLabel={currentCall.muted ? 'Unmute microphone' : 'Mute microphone'} onPress={toggleCurrentCallMute}>
                  <Ionicons name={currentCall.muted ? 'mic-off' : 'mic'} size={22} color={COLORS.text} />
                </Pressable>
                {currentCall.mode === 'video' && (
                  <Pressable style={styles.roundButton} accessibilityRole="button" accessibilityLabel={currentCall.cameraEnabled ? 'Turn camera off' : 'Turn camera on'} onPress={toggleCurrentCallCamera}>
                    <Ionicons name={currentCall.cameraEnabled ? 'videocam' : 'videocam-off'} size={22} color={COLORS.text} />
                  </Pressable>
                )}
                <Pressable style={[styles.roundButton, styles.reject]} accessibilityRole="button" accessibilityLabel="End call" onPress={() => void endCurrentCall('ended')}>
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
    backgroundColor: '#070912'
  },
  panel: {
    flex: 1,
    paddingHorizontal: 22,
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
    marginTop: 4,
    textAlign: 'center'
  },
  status: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject
  },
  localVideo: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 96,
    height: 136,
    borderRadius: 8,
    overflow: 'hidden'
  },
  retryButton: {
    position: 'absolute',
    bottom: 26,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  retryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: FONTS.semibold
  },
  mediaOrb: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.44)',
    marginBottom: 20
  },
  stageTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: FONTS.semibold,
    textAlign: 'center'
  },
  stageSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8
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
