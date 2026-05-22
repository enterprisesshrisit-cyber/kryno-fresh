import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiveKitRoom, VideoTrack, useRNE2EEManager, useTracks } from '@livekit/react-native';
import { Track } from 'livekit-client';

import FeedScreen from './screens/FeedScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import ProfileScreen from './screens/ProfileScreen';
import AuthScreen from './screens/AuthScreen';
import { COLORS, FONTS } from './lib/theme';
import { KrynoBackendProvider, useKrynoBackend } from './lib/krynoBackend';
import { captureMobileException, initMobileObservability } from './lib/observability';

initMobileObservability();

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const krynoNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.bg,
    card: COLORS.bg,
    border: COLORS.border,
    text: COLORS.text,
    primary: COLORS.primary,
    notification: COLORS.pink
  }
};

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    captureMobileException(error, { surface: 'AppErrorBoundary' });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={appStyles.splash}>
          <Text style={appStyles.splashTitle}>Kryno crashed on startup</Text>
          <Text style={appStyles.crashText}>{this.state.error.message}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// ─── MESSAGES STACK ──────────────────────────────────────────────────────────
function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MessagesList" component={MessagesScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}

// ─── PREMIUM TAB BAR (hidden on Chat screen) ────────────────────────────────
function KrynoTabBar({ state, navigation }: any) {
  // Detect if we're deep inside the Messages stack on the Chat screen
  const messagesRoute = state.routes.find((r: any) => r.name === 'Messages');
  const isInChat =
    messagesRoute?.state?.index != null &&
    messagesRoute.state.index > 0;

  if (isInChat) return null;

  const tabs = [
    { name: 'Feed', icon: 'home-outline', iconActive: 'home', label: 'Home' },
    { name: 'Discover', icon: 'compass-outline', iconActive: 'compass', label: 'Discover' },
    { name: 'Messages', icon: 'chatbubble-outline', iconActive: 'chatbubble', label: 'Messages' },
    { name: 'Profile', icon: 'person-outline', iconActive: 'person', label: 'Profile' },
  ];

  return (
    <View style={tabStyles.wrapper} pointerEvents="box-none">
      {/* Fade gradient behind tab bar */}
      <LinearGradient
        colors={['rgba(5,7,15,0)', 'rgba(5,7,15,1)']}
        style={tabStyles.fadeGrad}
        pointerEvents="none"
      />
      <View style={tabStyles.container}>
        <LinearGradient
          colors={['rgba(14,17,30,0.92)', 'rgba(8,10,20,0.96)']}
          style={tabStyles.bar}
        >
          {state.routes.map((route: any, index: number) => {
            const focused = state.index === index;
            const tab = tabs[index];
            const hasUnread = route.name === 'Messages';

            return (
              <View key={route.key} style={tabStyles.tabItem}>
                <View style={[tabStyles.tabBtn, focused && tabStyles.tabBtnActive]}>
                  {focused && (
                    <LinearGradient
                      colors={['rgba(99,102,241,0.28)', 'rgba(139,92,246,0.12)']}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Ionicons
                    name={(focused ? tab.iconActive : tab.icon) as any}
                    size={22}
                    color={focused ? COLORS.primary : COLORS.textMuted}
                    onPress={() => navigation.navigate(route.name)}
                  />
                  {hasUnread && !focused && <View style={tabStyles.badge} />}
                </View>
                <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>
                  {tab.label}
                </Text>
              </View>
            );
          })}
        </LinearGradient>
      </View>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <KrynoTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Messages" component={MessagesStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function KrynoAudioStage({ label }: { label: string }) {
  return (
    <View style={callStyles.audioStage}>
      <LinearGradient colors={['#6366F1', '#8B5CF6']} style={callStyles.audioAvatar}>
        <Text style={callStyles.audioAvatarText}>{label.charAt(0).toUpperCase()}</Text>
      </LinearGradient>
    </View>
  );
}

function KrynoLiveKitVideoStage({ remoteLabel }: { remoteLabel: string }) {
  const tracks = useTracks([Track.Source.Camera]);
  const remoteTrack = tracks.find((trackRef) => !trackRef.participant.isLocal);
  const localTrack = tracks.find((trackRef) => trackRef.participant.isLocal);

  return (
    <View style={callStyles.videoStage}>
      {remoteTrack ? (
        <VideoTrack trackRef={remoteTrack} style={callStyles.remoteVideo} objectFit="cover" />
      ) : (
        <View style={[callStyles.remoteVideo, callStyles.videoPlaceholder]}>
          <Ionicons name="videocam-outline" size={34} color={COLORS.textMuted} />
          <Text style={callStyles.placeholderText}>Waiting for {remoteLabel}'s video...</Text>
        </View>
      )}

      {localTrack ? (
        <VideoTrack trackRef={localTrack} style={callStyles.localPreview} objectFit="cover" mirror zOrder={1} />
      ) : null}
    </View>
  );
}

function KrynoLiveKitEncryptedStage({
  serverUrl,
  token,
  mediaEncryptionKey,
  mode,
  muted,
  cameraEnabled,
  remoteLabel,
  onTransportUpdate
}: {
  serverUrl: string;
  token: string;
  mediaEncryptionKey: string;
  mode: 'audio' | 'video';
  muted: boolean;
  cameraEnabled: boolean;
  remoteLabel: string;
  onTransportUpdate: (input: { phase?: 'ringing' | 'connecting' | 'connected'; status: string; connectedAt?: string }) => void;
}) {
  const { e2eeManager } = useRNE2EEManager({
    sharedKey: mediaEncryptionKey,
    keyProviderOptions: {
      sharedKey: true,
      ratchetSalt: 'kryno-livekit-v1',
      ratchetWindowSize: 16,
      failureTolerance: 10,
      keyringSize: 16,
      keySize: 128
    }
  });

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio={!muted}
      video={mode === 'video' && cameraEnabled}
      options={{
        adaptiveStream: true,
        dynacast: true,
        encryption: { e2eeManager }
      }}
      onConnected={() =>
        onTransportUpdate({
          phase: 'connected',
          status: mode === 'video' ? 'E2EE video call live.' : 'E2EE audio call live.',
          connectedAt: new Date().toISOString()
        })
      }
      onDisconnected={() =>
        onTransportUpdate({
          status: 'Secure media room disconnected.'
        })
      }
      onError={(error) =>
        onTransportUpdate({
          status: `Secure media room error: ${error.message}`
        })
      }
      onEncryptionError={(error) =>
        onTransportUpdate({
          status: `E2EE media error: ${error.message}`
        })
      }
    >
      {mode === 'video' ? <KrynoLiveKitVideoStage remoteLabel={remoteLabel} /> : <KrynoAudioStage label={remoteLabel} />}
    </LiveKitRoom>
  );
}

function CallOverlay() {
  const RTCView = React.useMemo(() => {
    try {
      return require('@livekit/react-native-webrtc').RTCView as any;
    } catch {
      return null;
    }
  }, []);
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

  if (!currentCall) {
    return null;
  }

  const showRemoteVideo = currentCall.mode === 'video' && !!remoteCallStreamUrl;
  const showLocalVideo = currentCall.mode === 'video' && !!localCallStreamUrl;
  const liveKitToken = currentCall.mediaProvider === 'livekit' ? currentCall.liveKitToken : null;
  const waitingForLiveKitKey = !!liveKitToken && !currentCall.mediaEncryptionKey;

  return (
    <View style={callStyles.overlay} pointerEvents="box-none">
      <LinearGradient colors={['rgba(5,7,15,0.92)', 'rgba(8,10,20,0.98)']} style={callStyles.card}>
        <Text style={callStyles.badge}>{currentCall.mode === 'video' ? 'Video call' : 'Audio call'}</Text>
        <Text style={callStyles.name}>{currentCall.remoteLabel}</Text>
        <Text style={callStyles.status}>{currentCall.status}</Text>

        {liveKitToken && currentCall.mediaEncryptionKey ? (
          <KrynoLiveKitEncryptedStage
            serverUrl={liveKitToken.url}
            token={liveKitToken.token}
            mediaEncryptionKey={currentCall.mediaEncryptionKey}
            mode={currentCall.mode}
            muted={currentCall.muted}
            cameraEnabled={currentCall.cameraEnabled}
            remoteLabel={currentCall.remoteLabel}
            onTransportUpdate={updateCurrentCallTransport}
          />
        ) : waitingForLiveKitKey ? (
          <View style={callStyles.audioStage}>
            <Ionicons name="shield-checkmark-outline" size={42} color={COLORS.primaryLight} />
            <Text style={callStyles.placeholderText}>Waiting for encrypted media key...</Text>
          </View>
        ) : currentCall.mode === 'video' ? (
          <View style={callStyles.videoStage}>
            {showRemoteVideo && RTCView ? (
              <RTCView streamURL={remoteCallStreamUrl!} style={callStyles.remoteVideo} objectFit="cover" />
            ) : (
              <View style={[callStyles.remoteVideo, callStyles.videoPlaceholder]}>
                <Ionicons name="videocam-outline" size={34} color={COLORS.textMuted} />
                <Text style={callStyles.placeholderText}>Waiting for video...</Text>
              </View>
            )}

            {showLocalVideo && RTCView && (
              <RTCView streamURL={localCallStreamUrl!} style={callStyles.localPreview} objectFit="cover" mirror />
            )}
          </View>
        ) : (
          <View style={callStyles.audioStage}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} style={callStyles.audioAvatar}>
              <Text style={callStyles.audioAvatarText}>{currentCall.remoteLabel.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          </View>
        )}

        <View style={callStyles.actions}>
          {currentCall.direction === 'incoming' && currentCall.phase === 'ringing' ? (
            <>
              <TouchableOpacity style={[callStyles.actionBtn, callStyles.rejectBtn]} onPress={() => void rejectCurrentCall()}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[callStyles.actionBtn, callStyles.acceptBtn]} onPress={() => void acceptCurrentCall()}>
                <Ionicons name="call" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={callStyles.actionBtn} onPress={toggleCurrentCallMute}>
                <Ionicons name={currentCall.muted ? 'mic-off' : 'mic'} size={18} color={COLORS.text} />
              </TouchableOpacity>
              {currentCall.mode === 'video' && (
                <TouchableOpacity style={callStyles.actionBtn} onPress={toggleCurrentCallCamera}>
                  <Ionicons name={currentCall.cameraEnabled ? 'videocam' : 'videocam-off'} size={18} color={COLORS.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[callStyles.actionBtn, callStyles.rejectBtn]} onPress={() => void endCurrentCall()}>
                <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

function AppShell() {
  const { error, initialized, loading, session } = useKrynoBackend();

  if (!initialized) {
    return (
      <View style={appStyles.splash}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={appStyles.splashSub}>Preparing Kryno mobile...</Text>
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (loading) {
    return (
      <View style={appStyles.splash}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6', '#EC4899']}
          style={appStyles.splashLogo}
        >
          <Text style={appStyles.splashLogoText}>K</Text>
        </LinearGradient>
        <Text style={appStyles.splashTitle}>Kryno</Text>
        <Text style={appStyles.splashSub}>Syncing live mobile data...</Text>
      </View>
    );
  }

  return (
    <View style={appStyles.appSurface}>
      <MainTabs />
      <CallOverlay />
      {error ? (
        <View style={appStyles.syncNotice} pointerEvents="none">
          <Text style={appStyles.syncNoticeText} numberOfLines={2}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <GestureHandlerRootView style={appStyles.appSurface}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <KrynoBackendProvider>
            <NavigationContainer theme={krynoNavigationTheme}>
              <AppShell />
            </NavigationContainer>
          </KrynoBackendProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const tabStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  fadeGrad: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  container: {
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === 'ios' ? 22 : 14,
    paddingTop: 6,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 26,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabBtn: {
    width: 48,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  tabBtnActive: {
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  label: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: FONTS.medium,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
  },
  badge: {
    position: 'absolute',
    top: 5,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.pink,
    borderWidth: 1.5,
    borderColor: COLORS.bg,
  },
});

const appStyles = StyleSheet.create({
  appSurface: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  splash: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  splashLogo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 16,
  },
  splashLogoText: {
    fontSize: 36,
    fontWeight: '900',
    color: 'white',
    letterSpacing: -1,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  splashSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  crashText: {
    paddingHorizontal: 24,
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  syncNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: Platform.OS === 'ios' ? 58 : 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.26)',
    backgroundColor: 'rgba(15,23,42,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  syncNoticeText: {
    color: COLORS.textSub,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

const callStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(99,102,241,0.18)',
    color: COLORS.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  status: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  videoStage: {
    height: 320,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#090d18',
    position: 'relative',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
  },
  localPreview: {
    position: 'absolute',
    width: 112,
    height: 160,
    right: 12,
    bottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  videoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  audioStage: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioAvatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioAvatarText: {
    fontSize: 38,
    fontWeight: '900',
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 8,
  },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
});
