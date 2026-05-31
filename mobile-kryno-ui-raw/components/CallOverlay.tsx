import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS } from '../lib/theme';
import { useKrynoBackend } from '../lib/krynoBackend';

type LiveCallSession = {
  setMuted: (muted: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
};

function phaseFromLiveKitState(state: unknown) {
  const value = String(state).toLowerCase();

  if (value.includes('connected')) {
    return 'connected' as const;
  }

  if (value.includes('connecting') || value.includes('reconnecting')) {
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
  const [mediaError, setMediaError] = useState('');

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
    updateCurrentCallTransport({
      phase: 'connecting',
      status: 'Connecting LiveKit media transport...'
    });

    void import('../lib/livekitCall')
      .then(({ connectKrynoLiveKitCall }) =>
        connectKrynoLiveKitCall({
          url: token.url,
          token: token.token,
          mode,
          onConnectionStateChange: (state) => {
            const phase = phaseFromLiveKitState(state);
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
              updateCurrentCallTransport({
                status: 'Call media disconnected.'
              });
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
        await session.setMuted(currentCall.muted).catch(() => undefined);
        if (mode === 'video') {
          await session.setCameraEnabled(currentCall.cameraEnabled).catch(() => undefined);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        const message = safeCallMediaError(error);
        setMediaError(message);
        updateCurrentCallTransport({
          status: `Call media failed: ${message}`
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentCall?.callId,
    currentCall?.cameraEnabled,
    currentCall?.liveKitToken?.token,
    currentCall?.liveKitToken?.url,
    currentCall?.mediaProvider,
    currentCall?.mode,
    currentCall?.muted,
    currentCall?.phase,
    updateCurrentCallTransport
  ]);

  useEffect(() => {
    const session = liveSessionRef.current;
    if (!session || !currentCall || liveSessionCallIdRef.current !== currentCall.callId) {
      return;
    }

    void session.setMuted(currentCall.muted).catch(() => undefined);
    if (currentCall.mode === 'video') {
      void session.setCameraEnabled(currentCall.cameraEnabled).catch(() => undefined);
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
      ? 'Encrypted chat signaling is active. Media is carried over LiveKit/WebRTC secure transport.'
      : currentCall.phase === 'connecting'
        ? 'Joining the managed call room now.'
        : currentCall.direction === 'incoming'
          ? 'Accept to join the secure transport, or decline to send a missed call state.'
          : 'Waiting for the other phone to answer. A call notification has been sent if they are offline.';
  const stageIcon =
    currentCall.phase === 'connected'
      ? currentCall.mode === 'video'
        ? 'videocam'
        : 'volume-high'
      : currentCall.mode === 'video'
        ? 'videocam-outline'
        : 'call-outline';

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
            <Text style={styles.status}>{mediaError || currentCall.status}</Text>
          </View>

          <View style={styles.stage}>
            <View style={styles.mediaOrb}>
              <Ionicons name={stageIcon as any} size={52} color={COLORS.text} />
            </View>
            <Text style={styles.stageTitle}>
              {stageTitle}
            </Text>
            <Text style={styles.stageSub}>
              {stageSubtitle}
            </Text>
          </View>

          <View style={styles.controls}>
            {currentCall.direction === 'incoming' && currentCall.phase === 'ringing' ? (
              <>
                <Pressable style={[styles.roundButton, styles.reject]} onPress={() => void rejectCurrentCall('declined')}>
                  <Ionicons name="call" size={24} color="#fff" style={styles.hangupIcon} />
                </Pressable>
                <Pressable
                  style={[styles.roundButton, styles.accept]}
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
    minHeight: '72%',
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
    minHeight: 320,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#070a12',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
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
