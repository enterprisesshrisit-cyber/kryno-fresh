import React from 'react';
import { ActivityIndicator, Pressable, View, Text, StyleSheet, Platform } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import FeedScreen from './screens/FeedScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import ProfileScreen from './screens/ProfileScreen';
import PublicProfileScreen from './screens/PublicProfileScreen';
import MembershipScreen from './screens/MembershipScreen';
import AuthScreen from './screens/AuthScreen';
import { COLORS, FONTS } from './lib/theme';
import { KrynoBackendProvider, useKrynoBackend } from './lib/krynoBackend';
import { captureMobileException, initMobileObservability } from './lib/observability';

initMobileObservability();

const Tab = createBottomTabNavigator();
const MessagesStackNavigator = createNativeStackNavigator();

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
    <MessagesStackNavigator.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
      <MessagesStackNavigator.Screen name="MessagesList" component={MessagesScreen} />
      <MessagesStackNavigator.Screen name="Chat" component={ChatScreen} />
    </MessagesStackNavigator.Navigator>
  );
}

// ─── PREMIUM TAB BAR (hidden on Chat screen) ────────────────────────────────
function KrynoTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom + 8, Platform.OS === 'android' ? 38 : 26);
  const tabsByName: Record<string, { icon: string; iconActive: string; label: string }> = {
    Feed: { icon: 'home-outline', iconActive: 'home', label: 'Home' },
    Discover: { icon: 'compass-outline', iconActive: 'compass', label: 'Discover' },
    Messages: { icon: 'chatbubble-outline', iconActive: 'chatbubble', label: 'Messages' },
    Profile: { icon: 'person-outline', iconActive: 'person', label: 'Profile' },
  };
  const activeRoute = state.routes[state.index];

  if (!tabsByName[activeRoute?.name]) {
    return null;
  }

  // Detect if we're deep inside the Messages stack on the Chat screen
  const messagesRoute = state.routes.find((r: any) => r.name === 'Messages');
  const isInChat =
    messagesRoute?.state?.index != null &&
    messagesRoute.state.index > 0;

  if (isInChat) return null;

  const visibleRoutes = state.routes
    .map((route: any, index: number) => ({ route, index, tab: tabsByName[route.name] }))
    .filter((entry: any) => !!entry.tab);

  return (
    <View style={tabStyles.wrapper} pointerEvents="box-none">
      {/* Fade gradient behind tab bar */}
      <LinearGradient
        colors={['rgba(5,7,15,0)', 'rgba(5,7,15,1)']}
        style={[tabStyles.fadeGrad, { height: 90 + bottomInset }]}
        pointerEvents="none"
      />
      <View style={[tabStyles.container, { paddingBottom: bottomInset }]}>
        <LinearGradient
          colors={['rgba(14,17,30,0.92)', 'rgba(8,10,20,0.96)']}
          style={tabStyles.bar}
          pointerEvents="box-none"
        >
          {visibleRoutes.map(({ route, index, tab }: any) => {
            const focused = state.index === index;
            const hasUnread = route.name === 'Messages';

            return (
              <Pressable
                key={route.key}
                style={tabStyles.tabItem}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                hitSlop={{ top: 14, right: 6, bottom: 14, left: 6 }}
                android_ripple={{ color: 'rgba(99,102,241,0.18)', borderless: false }}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label} tab`}
              >
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
                  />
                  {hasUnread && !focused && <View style={tabStyles.badge} />}
                </View>
                <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
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
      detachInactiveScreens={false}
      tabBar={(props) => <KrynoTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Messages" component={MessagesStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Tab.Screen name="Membership" component={MembershipScreen} />
    </Tab.Navigator>
  );
}

function SafeCallOverlayHost() {
  const { currentCall, endCurrentCall } = useKrynoBackend();
  const [Overlay, setOverlay] = React.useState<React.ComponentType | null>(null);
  const [loadError, setLoadError] = React.useState('');

  React.useEffect(() => {
    if (!currentCall || Overlay || loadError) {
      return;
    }

    let cancelled = false;
    console.log('[KrynoStartup] call overlay loading');

    void import('./components/CallOverlay')
      .then((module) => {
        if (cancelled) {
          return;
        }

        setOverlay(() => module.default);
        console.log('[KrynoStartup] call overlay ready');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Call UI failed to load.';
        setLoadError(message);
        console.warn('[KrynoStartup] call overlay failed', message);
        captureMobileException(error instanceof Error ? error : new Error(message), { surface: 'CallOverlayHost' });
      });

    return () => {
      cancelled = true;
    };
  }, [currentCall, Overlay, loadError]);

  if (!currentCall) {
    return null;
  }

  if (Overlay) {
    return <Overlay />;
  }

  if (!loadError) {
    return null;
  }

  return (
    <View style={appStyles.callFallback} pointerEvents="box-none">
      <View style={appStyles.callFallbackPanel}>
        <Text style={appStyles.callFallbackTitle}>Call unavailable</Text>
        <Text style={appStyles.callFallbackText}>{loadError}</Text>
        <Pressable style={appStyles.callFallbackButton} onPress={() => void endCurrentCall('call_ui_failed')}>
          <Text style={appStyles.callFallbackButtonText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppShell() {
  const { initialized, session, foregroundNotice, dismissForegroundNotice } = useKrynoBackend();

  React.useEffect(() => {
    console.log(
      '[KrynoStartup] app shell state',
      initialized ? (session ? 'authenticated' : 'signed_out') : 'initializing'
    );
  }, [initialized, session]);

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

  return (
    <View style={appStyles.appSurface}>
      <MainTabs />
      {foregroundNotice && (
        <Pressable
          style={appStyles.foregroundNotice}
          onPress={dismissForegroundNotice}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Kryno notification"
        >
          <Text style={appStyles.foregroundNoticeTitle}>{foregroundNotice.title}</Text>
          <Text style={appStyles.foregroundNoticeText}>{foregroundNotice.body}</Text>
        </Pressable>
      )}
      <SafeCallOverlayHost />
    </View>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  React.useEffect(() => {
    console.log('[KrynoStartup] app mounted');
  }, []);

  return (
    <GestureHandlerRootView style={appStyles.appSurface}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <KrynoBackendProvider>
            <NavigationContainer
              theme={krynoNavigationTheme}
              onReady={() => console.log('[KrynoStartup] navigation ready')}
              onStateChange={(state) => {
                const route = state?.routes?.[state.index ?? 0];
                console.log('[KrynoStartup] navigation state', route?.name ?? 'unknown');
              }}
            >
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
    zIndex: 500,
    elevation: 500,
  },
  fadeGrad: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: 96,
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
    justifyContent: 'center',
    gap: 3,
    minHeight: 76,
    borderRadius: 22,
    paddingVertical: 6,
  },
  tabBtn: {
    width: 62,
    height: 54,
    borderRadius: 18,
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
  callFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  callFallbackPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(12,15,28,0.96)',
    padding: 18,
    gap: 10,
  },
  callFallbackTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  callFallbackText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  callFallbackButton: {
    alignSelf: 'flex-end',
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  callFallbackButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  foregroundNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: Platform.OS === 'ios' ? 58 : 28,
    zIndex: 80,
    elevation: 80,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.36)',
    backgroundColor: 'rgba(12,15,28,0.98)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#6366F1',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  foregroundNoticeTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
  },
  foregroundNoticeText: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
});
