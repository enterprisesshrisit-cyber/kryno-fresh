import React from 'react';
import { View, Text, StyleSheet, Platform, Animated } from 'react-native';
import { useNavigationState } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';

import FeedScreen from './screens/FeedScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import ProfileScreen from './screens/ProfileScreen';
import { COLORS, FONTS } from './lib/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  if (!fontsLoaded) {
    return (
      <View style={appStyles.splash}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6', '#EC4899']}
          style={appStyles.splashLogo}
        >
          <Text style={appStyles.splashLogoText}>K</Text>
        </LinearGradient>
        <Text style={appStyles.splashTitle}>Kryno</Text>
        <Text style={appStyles.splashSub}>Premium Digital Identity</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator
            tabBar={(props) => <KrynoTabBar {...props} />}
            screenOptions={{ headerShown: false }}
          >
            <Tab.Screen name="Feed" component={FeedScreen} />
            <Tab.Screen name="Discover" component={DiscoverScreen} />
            <Tab.Screen name="Messages" component={MessagesStack} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
          </Tab.Navigator>
        </NavigationContainer>
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
});
