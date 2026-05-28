import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Animated,
  Dimensions, StatusBar, Modal, TouchableWithoutFeedback,
  Alert, PermissionsAndroid,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACE, MOOD, TIER } from '../lib/theme';
import ChatBackground, { type ChatThemeType } from '../components/ChatBackground';
import { useKrynoBackend } from '../lib/krynoBackend';

const { width, height } = Dimensions.get('window');
const QUICK_EMOJIS = ['😀', '😂', '😍', '🔥', '👏', '❤️', '🙏', '😎', '😢', '👍', '🎉', '💯'];

type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed' | 'received';
type AttachmentKind = 'voice' | 'image' | 'video' | 'file';

function statusLabel(status?: MessageStatus) {
  switch (status) {
    case 'sending':
      return 'Sending';
    case 'delivered':
      return 'Delivered';
    case 'seen':
      return 'Seen';
    case 'failed':
      return 'Failed';
    case 'sent':
      return 'Sent';
    default:
      return '';
  }
}

function formatDuration(seconds?: number) {
  const safe = Math.max(0, Math.round(seconds ?? 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
const REACTIONS = ['✦', '🌙', '🔥', '❤️', '🧠', '👏'];

// ─── CHAT THEMES ─────────────────────────────────────────────────────────────
const CHAT_THEMES: { id: ChatThemeType; label: string; icon: string; accent: string }[] = [
  { id: 'dark_glass',    label: 'Dark Glass',   icon: '🌌', accent: '#6366F1' },
  { id: 'breathing_3d', label: '3D Breathing',  icon: '🫧', accent: '#8B5CF6' },
  { id: 'minimal_calm', label: 'Minimal Calm',  icon: '🌙', accent: '#06B6D4' },
  { id: 'premium_aura', label: 'Premium Aura',  icon: '🌈', accent: '#EC4899' },
];

// ─── MENU ITEMS ───────────────────────────────────────────────────────────────
type MenuItem = {
  id: string;
  icon: string;
  label: string;
  destructive?: boolean;
  toggle?: boolean;
};

const MENU_PRIMARY: MenuItem[] = [
  { id: 'theme',   icon: '🎭', label: 'Change Chat Theme' },
  { id: 'focus',   icon: '🧠', label: 'Focus Mode',        toggle: true },
  { id: 'mute',    icon: '🔕', label: 'Mute Notifications', toggle: true },
  { id: 'private', icon: '🔒', label: 'Private Chat Mode',  toggle: true },
  { id: 'music',   icon: '🎧', label: 'Chat Music / Vibe' },
];

const MENU_DESTRUCTIVE: MenuItem[] = [
  { id: 'block',  icon: '🚫', label: 'Block User',  destructive: true },
  { id: 'report', icon: '⚠️', label: 'Report',      destructive: true },
];

// ─── THEME PICKER SHEET ───────────────────────────────────────────────────────
function ThemeSheet({
  visible, current, onSelect, onClose,
}: {
  visible: boolean;
  current: ChatThemeType;
  onSelect: (t: ChatThemeType) => void;
  onClose: () => void;
}) {
  const slideY  = useRef(new Animated.Value(400)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 72, friction: 12 }),
        Animated.timing(bgOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,    { toValue: 400, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0,   duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: bgOpacity }]}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={['rgba(12,15,28,0.99)', 'rgba(6,8,18,1)']} style={styles.sheetInner}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Chat Background</Text>
          <Text style={styles.sheetSub}>Choose your conversation atmosphere</Text>
          <View style={styles.themeGrid}>
            {CHAT_THEMES.map(t => (
              <TouchableOpacity
                key={t.id}
                onPress={() => { onSelect(t.id); onClose(); }}
                activeOpacity={0.82}
                style={[styles.themeItem, current === t.id && { borderColor: t.accent + 'AA', backgroundColor: t.accent + '18' }]}
              >
                <Text style={styles.themeItemIcon}>{t.icon}</Text>
                <Text style={[styles.themeItemLabel, current === t.id && { color: t.accent }]}>{t.label}</Text>
                {current === t.id && (
                  <View style={[styles.themeItemCheck, { backgroundColor: t.accent }]}>
                    <Ionicons name="checkmark" size={9} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

// ─── PREMIUM POPUP MENU ───────────────────────────────────────────────────────
function MenuPopup({
  visible,
  toggleStates,
  onAction,
  onClose,
}: {
  visible: boolean;
  toggleStates: Record<string, boolean>;
  onAction: (id: string) => void;
  onClose: () => void;
}) {
  const scaleAnim   = useRef(new Animated.Value(0.82)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const bgAnim      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1,    useNativeDriver: true, tension: 180, friction: 14 }),
        Animated.timing(opacityAnim, { toValue: 1,    duration: 180, useNativeDriver: true }),
        Animated.timing(bgAnim,      { toValue: 1,    duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim,   { toValue: 0.88, duration: 160, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,    duration: 160, useNativeDriver: true }),
        Animated.timing(bgAnim,      { toValue: 0,    duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      {/* Dim backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.38)', opacity: bgAnim }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Floating popup — anchored top-right */}
      <Animated.View
        style={[
          styles.popup,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
      >
        {/* Glass panel */}
        <LinearGradient
          colors={['rgba(18,22,42,0.98)', 'rgba(10,13,26,0.99)']}
          style={styles.popupInner}
        >
          {/* Glow edge */}
          <View style={styles.popupGlowEdge} />

          {/* Primary items */}
          {MENU_PRIMARY.map((item, idx) => (
            <MenuRow
              key={item.id}
              item={item}
              isOn={!!toggleStates[item.id]}
              onPress={() => onAction(item.id)}
              showDivider={idx < MENU_PRIMARY.length - 1}
            />
          ))}

          {/* Separator */}
          <View style={styles.popupSectionDivider} />

          {/* Destructive items */}
          {MENU_DESTRUCTIVE.map((item, idx) => (
            <MenuRow
              key={item.id}
              item={item}
              isOn={false}
              onPress={() => onAction(item.id)}
              showDivider={idx < MENU_DESTRUCTIVE.length - 1}
            />
          ))}
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

// ─── MENU ROW ─────────────────────────────────────────────────────────────────
function MenuRow({
  item, isOn, onPress, showDivider,
}: {
  item: MenuItem;
  isOn: boolean;
  onPress: () => void;
  showDivider: boolean;
}) {
  const pressAnim = useRef(new Animated.Value(0)).current;

  const onPressIn  = () => Animated.timing(pressAnim, { toValue: 1, duration: 80,  useNativeDriver: false }).start();
  const onPressOut = () => Animated.timing(pressAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();

  const bgColor = pressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: item.destructive
      ? ['rgba(239,68,68,0)', 'rgba(239,68,68,0.1)']
      : ['rgba(99,102,241,0)', 'rgba(99,102,241,0.1)'],
  });

  return (
    <>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
      >
        <Animated.View style={[styles.menuRow, { backgroundColor: bgColor }]}>
          {/* Icon */}
          <View style={[
            styles.menuIconWrap,
            item.destructive
              ? styles.menuIconDestructive
              : styles.menuIconNormal,
          ]}>
            <Text style={styles.menuItemIcon}>{item.icon}</Text>
          </View>

          {/* Label */}
          <Text style={[
            styles.menuLabel,
            item.destructive && styles.menuLabelDestructive,
          ]}>
            {item.label}
          </Text>

          {/* Toggle pill OR chevron */}
          {item.toggle ? (
            <View style={[styles.togglePill, isOn && styles.togglePillOn]}>
              <View style={[styles.toggleThumb, isOn && styles.toggleThumbOn]} />
            </View>
          ) : (
            <Ionicons
              name="chevron-forward"
              size={14}
              color={item.destructive ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)'}
            />
          )}
        </Animated.View>
      </TouchableOpacity>

      {showDivider && <View style={styles.menuDivider} />}
    </>
  );
}

// ─── CALL BUTTON ─────────────────────────────────────────────────────────────
function CallButton({ icon, type, onPress }: { icon: any; type: 'voice' | 'video'; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  const onPressIn = () => Animated.parallel([
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 220 }),
    Animated.timing(glow,  { toValue: 1, duration: 120, useNativeDriver: true }),
  ]).start();

  const onPressOut = () => Animated.parallel([
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 160 }),
    Animated.timing(glow,  { toValue: 0, duration: 280, useNativeDriver: true }),
  ]).start();

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.callBtnWrap, { transform: [{ scale }] }]}>
        <Animated.View style={[
          styles.callBtnHalo,
          { opacity: glowOpacity, backgroundColor: type === 'video' ? 'rgba(6,182,212,0.45)' : 'rgba(99,102,241,0.45)' },
        ]} />
        <LinearGradient
          colors={type === 'video'
            ? ['rgba(6,182,212,0.2)', 'rgba(6,182,212,0.08)']
            : ['rgba(99,102,241,0.2)', 'rgba(99,102,241,0.08)']}
          style={styles.callBtnGrad}
        >
          <Ionicons
            name={icon}
            size={16}
            color={type === 'video' ? COLORS.cyan : COLORS.primaryLight}
          />
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── THREE-DOT BUTTON ─────────────────────────────────────────────────────────
function ThreeDotButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 220 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 160 }).start();

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Chat menu"
    >
      <Animated.View style={[styles.threeDotBtn, { transform: [{ scale }] }]}>
        <View style={styles.threeDotInner}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────
function VoiceMessageBubble({
  uri,
  durationSeconds,
  isMe,
  status
}: {
  uri?: string;
  durationSeconds?: number;
  isMe: boolean;
  status?: MessageStatus;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  useEffect(() => () => {
    try {
      playerRef.current?.pause();
    } catch {
      // no-op
    }
    playerRef.current = null;
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const duration = player.duration || durationSeconds || 1;
      const next = Math.min(1, Math.max(0, player.currentTime / duration));
      setProgress(next);
      if (duration > 0 && player.currentTime >= duration - 0.1) {
        player.pause();
        setPlaying(false);
        setProgress(0);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [durationSeconds, playing]);

  const togglePlayback = () => {
    if (!uri) {
      Alert.alert('Voice unavailable', 'This encrypted voice note could not be opened on this device.');
      return;
    }

    try {
      const player = playerRef.current ?? createAudioPlayer({ uri }, { updateInterval: 250 });
      playerRef.current = player;
      if (playing) {
        player.pause();
        setPlaying(false);
        return;
      }
      player.play();
      setPlaying(true);
    } catch (error) {
      Alert.alert('Playback failed', error instanceof Error ? error.message : 'Unable to play this voice note.');
    }
  };

  return (
    <View style={[styles.voiceBubble, isMe && styles.voiceBubbleMe]}>
      <TouchableOpacity style={styles.voicePlayBtn} onPress={togglePlayback} activeOpacity={0.82}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={COLORS.white} />
      </TouchableOpacity>
      <View style={styles.voiceBody}>
        <View style={styles.waveform}>
          {Array.from({ length: 18 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.waveBar,
                { height: 8 + ((index * 7) % 18), opacity: progress >= index / 18 ? 1 : 0.42 }
              ]}
            />
          ))}
        </View>
        <View style={styles.voiceMetaRow}>
          <Text style={styles.voiceDuration}>{formatDuration(durationSeconds)}</Text>
          {status === 'failed' && <Text style={styles.voiceFailed}>Retry</Text>}
        </View>
      </View>
    </View>
  );
}

function MediaMessageBubble({
  uri,
  mediaKind,
  fileName,
  isMe
}: {
  uri?: string;
  mediaKind?: AttachmentKind;
  fileName?: string;
  isMe: boolean;
}) {
  if (mediaKind === 'image' && uri) {
    return (
      <View style={[styles.mediaBubble, isMe && styles.mediaBubbleMe]}>
        <Image source={{ uri }} style={styles.mediaPreview} contentFit="cover" />
      </View>
    );
  }

  return (
    <View style={[styles.fileBubble, isMe && styles.fileBubbleMe]}>
      <Ionicons name={mediaKind === 'video' ? 'videocam' : 'document-attach'} size={22} color={COLORS.primaryLight} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fileTitle}>{mediaKind === 'video' ? 'Encrypted video' : 'Encrypted file'}</Text>
        <Text style={styles.fileName} numberOfLines={1}>{fileName || 'Attachment'}</Text>
      </View>
    </View>
  );
}

function MessageBubble({
  msg, onReact,
}: {
  msg: {
    id: string;
    from: 'me' | 'them';
    text: string;
    time: string;
    reactions: string[];
    status?: MessageStatus;
    kind?: 'text' | 'attachment';
    mediaKind?: AttachmentKind;
    localUri?: string;
    fileName?: string;
    mimeType?: string;
    durationSeconds?: number;
  };
  onReact: (id: string, r: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const slideAnim    = useRef(new Animated.Value(msg.from === 'me' ? 22 : -22)).current;
  const scaleAnim    = useRef(new Animated.Value(0.94)).current;
  const reactionAnim = useRef(new Animated.Value(0)).current;
  const pressScale   = useRef(new Animated.Value(1)).current;
  const isMe = msg.from === 'me';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: 30, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 140, friction: 12 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 140, friction: 12 }),
    ]).start();
  }, []);

  const toggleReactions = () => {
    const next = !showReactions;
    setShowReactions(next);
    Animated.spring(reactionAnim, { toValue: next ? 1 : 0, useNativeDriver: true, tension: 180, friction: 10 }).start();
  };

  const onPressIn  = () => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, tension: 200 }).start();
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, tension: 160 }).start();

  return (
    <Animated.View style={[
      styles.msgRow,
      isMe && styles.msgRowMe,
      { opacity: fadeAnim, transform: [{ translateX: slideAnim }, { scale: scaleAnim }] },
    ]}>
      {!isMe && (
        <Image source={{ uri: 'https://api.dicebear.com/9.x/initials/png?seed=KRYNO&backgroundColor=111827&fontColor=e5e7eb' }} style={styles.msgAvatar} contentFit="cover" />
      )}

      <View style={[styles.msgBubbleWrap, isMe && styles.msgBubbleWrapMe]}>
        <TouchableOpacity activeOpacity={1} onLongPress={toggleReactions} onPressIn={onPressIn} onPressOut={onPressOut}>
          <Animated.View style={{ transform: [{ scale: pressScale }] }}>
            {isMe ? (
              <View style={styles.sentBubble}>
                <LinearGradient
                  colors={['#7C7FF5', '#6366F1', '#8B5CF6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.sentBubbleGrad}
                >
                  {msg.kind === 'attachment' && msg.mediaKind === 'voice' ? (
                    <VoiceMessageBubble uri={msg.localUri} durationSeconds={msg.durationSeconds} isMe status={msg.status} />
                  ) : msg.kind === 'attachment' ? (
                    <MediaMessageBubble uri={msg.localUri} mediaKind={msg.mediaKind} fileName={msg.fileName} isMe />
                  ) : (
                    <Text style={styles.msgTextMe}>{msg.text}</Text>
                  )}
                </LinearGradient>
                <View style={styles.sentBubbleGlowEdge} />
              </View>
            ) : (
              <View style={styles.recvBubble}>
                {msg.kind === 'attachment' && msg.mediaKind === 'voice' ? (
                  <VoiceMessageBubble uri={msg.localUri} durationSeconds={msg.durationSeconds} isMe={false} status={msg.status} />
                ) : msg.kind === 'attachment' ? (
                  <MediaMessageBubble uri={msg.localUri} mediaKind={msg.mediaKind} fileName={msg.fileName} isMe={false} />
                ) : (
                  <Text style={styles.msgTextThem}>{msg.text}</Text>
                )}
              </View>
            )}
          </Animated.View>
        </TouchableOpacity>

        {msg.reactions.length > 0 && (
          <View style={[styles.msgReactions, isMe && styles.msgReactionsMe]}>
            {msg.reactions.map((r, i) => (
              <View key={i} style={styles.reactionPill}>
                <Text style={styles.reactionEmoji}>{r}</Text>
              </View>
            ))}
          </View>
        )}

        {showReactions && (
          <Animated.View style={[
            styles.reactionPicker,
            isMe && styles.reactionPickerMe,
            { transform: [{ scale: reactionAnim }], opacity: reactionAnim },
          ]}>
            <LinearGradient
              colors={['rgba(16,20,40,0.99)', 'rgba(9,12,24,0.99)']}
              style={styles.reactionPickerInner}
            >
              {REACTIONS.map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => { onReact(msg.id, r); setShowReactions(false); }}
                  style={styles.reactionOption}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionOptionText}>{r}</Text>
                </TouchableOpacity>
              ))}
            </LinearGradient>
          </Animated.View>
        )}

        <Animated.Text style={[styles.msgTime, isMe && styles.msgTimeMe, { opacity: fadeAnim }]}>
          {isMe && statusLabel(msg.status) ? `${msg.time} · ${statusLabel(msg.status)}` : msg.time}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────
function TypingIndicator() {
  const d0 = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const wrapFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(wrapFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    [d0, d1, d2].forEach((dot, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 150),
        Animated.timing(dot, { toValue: -7, duration: 250, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0,  duration: 250, useNativeDriver: true }),
        Animated.delay(500 - i * 150),
      ])).start()
    );
  }, []);

  return (
    <Animated.View style={[styles.typingWrap, { opacity: wrapFade }]}>
      <Image source={{ uri: 'https://api.dicebear.com/9.x/initials/png?seed=KRYNO&backgroundColor=111827&fontColor=e5e7eb' }} style={styles.typingAvatar} contentFit="cover" />
      <View style={styles.typingBubble}>
        {[d0, d1, d2].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </Animated.View>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function ChatScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { getConversationMessages, sendConversationMessage, sendConversationAttachment, markConversationRead, startConversationCall } = useKrynoBackend();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const convo = route?.params?.conversation || {
    user: {
      name: 'Kryno User',
      handle: '@kryno',
      avatar: 'https://api.dicebear.com/9.x/initials/png?seed=KRYNO&backgroundColor=111827&fontColor=e5e7eb',
      tier: 'Basic',
      online: false,
      mood: 'chill'
    },
  };
  const conversationKey =
    convo.conversationKey ||
    convo.recipientLookup ||
    convo.user?.handle?.replace(/^@/, '') ||
    convo.user?.name?.toLowerCase().replace(/\s+/g, '.') ||
    'kryno';
  const liveMessages = getConversationMessages(conversationKey);
  const bottomInputInset = Math.max(insets.bottom, Platform.OS === 'android' ? 34 : 10);

  const [messages,       setMessages]       = useState(liveMessages);
  const [input,          setInput]          = useState('');
  const [typing,         setTyping]         = useState(false);
  const [chatTheme,      setChatTheme]      = useState<ChatThemeType>('dark_glass');
  const [showMenu,       setShowMenu]       = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [showEmojiTray,  setShowEmojiTray]  = useState(false);
  const [composerBusy,   setComposerBusy]   = useState(false);
  const [toggleStates,   setToggleStates]   = useState<Record<string, boolean>>({
    focus: false, mute: false, private: false,
  });

  const flatRef = useRef<FlatList>(null);
  const tierCfg = TIER[convo.user.tier as keyof typeof TIER] || TIER['Inner Circle'];
  const moodCfg = MOOD[convo.user.mood as keyof typeof MOOD] || MOOD.chill;

  useEffect(() => {
    setMessages(liveMessages);
  }, [liveMessages]);

  useEffect(() => {
    markConversationRead(conversationKey);
  }, [conversationKey, markConversationRead]);

  // Handle menu actions
  const handleMenuAction = useCallback((id: string) => {
    if (id === 'theme') {
      setShowMenu(false);
      setTimeout(() => setShowThemeSheet(true), 220);
      return;
    }
    if (['focus', 'mute', 'private'].includes(id)) {
      setToggleStates(prev => ({ ...prev, [id]: !prev[id] }));
      return;
    }
    setShowMenu(false);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const nextText = input.trim();
    setInput('');
    setTyping(false);

    try {
      await sendConversationMessage(
        {
          conversationKey,
          recipientLookup: convo.recipientLookup || convo.user?.handle?.replace(/^@/, '') || conversationKey,
          user: convo.user
        },
        nextText
      );
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (error) {
      setInput(nextText);
      Alert.alert(
        'Message failed',
        error instanceof Error ? error.message : 'Unable to send this message right now.'
      );
    }
  };

  const ensureCallPermissions = useCallback(async (mode: 'audio' | 'video') => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (mode === 'video') {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    const result = await PermissionsAndroid.requestMultiple(permissions);
    const blocked = permissions.filter((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);
    if (blocked.length > 0) {
      Alert.alert(
        'Call permission needed',
        mode === 'video'
          ? 'Allow microphone and camera access to start a video call.'
          : 'Allow microphone access to start an audio call.'
      );
      return false;
    }

    return true;
  }, []);

  const startVoiceCall = async () => {
    try {
      if (!(await ensureCallPermissions('audio'))) {
        return;
      }
      await startConversationCall(
        {
          conversationKey,
          recipientLookup: convo.recipientLookup || convo.user?.handle?.replace(/^@/, '') || conversationKey,
          user: convo.user
        },
        'audio'
      );
    } catch (callError) {
      Alert.alert(
        'Call failed',
        callError instanceof Error ? callError.message : 'Unable to start audio call right now.'
      );
    }
  };

  const startVideoCall = async () => {
    try {
      if (!(await ensureCallPermissions('video'))) {
        return;
      }
      await startConversationCall(
        {
          conversationKey,
          recipientLookup: convo.recipientLookup || convo.user?.handle?.replace(/^@/, '') || conversationKey,
          user: convo.user
        },
        'video'
      );
    } catch (callError) {
      Alert.alert(
        'Video call failed',
        callError instanceof Error ? callError.message : 'Unable to start video call right now.'
      );
    }
  };

  const pickChatMedia = useCallback(async () => {
    if (composerBusy) return;
    setComposerBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Media permission needed', 'Allow photo and video access to attach media in chat.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.86,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      await sendConversationAttachment(
        {
          conversationKey,
          recipientLookup: convo.recipientLookup || convo.user?.handle?.replace(/^@/, '') || conversationKey,
          user: convo.user
        },
        {
          uri: asset.uri,
          fileName: asset.fileName || asset.uri.split('/').pop() || `kryno-${asset.type === 'video' ? 'video.mp4' : 'photo.jpg'}`,
          mimeType,
          mediaKind: asset.type === 'video' ? 'video' : 'image'
        }
      );
    } catch (error) {
      Alert.alert('Media failed', error instanceof Error ? error.message : 'Unable to attach media right now.');
    } finally {
      setComposerBusy(false);
    }
  }, [composerBusy, conversationKey, convo, sendConversationAttachment]);

  const toggleVoiceNote = useCallback(async () => {
    if (composerBusy) return;

    if (recorderState.isRecording) {
      setComposerBusy(true);
      try {
        await audioRecorder.stop();
        const seconds = Math.max(1, Math.round(audioRecorder.currentTime || recorderState.durationMillis / 1000 || 1));
        const uri = audioRecorder.uri || recorderState.url;
        if (!uri) {
          throw new Error('Recorder did not return an audio file.');
        }
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        await sendConversationAttachment(
          {
            conversationKey,
            recipientLookup: convo.recipientLookup || convo.user?.handle?.replace(/^@/, '') || conversationKey,
            user: convo.user
          },
          {
            uri,
            fileName: `voice-${Date.now()}.m4a`,
            mimeType: 'audio/mp4',
            mediaKind: 'voice',
            durationSeconds: seconds
          }
        );
      } catch (error) {
        Alert.alert('Voice note failed', error instanceof Error ? error.message : 'Unable to send this voice note.');
      } finally {
        setComposerBusy(false);
      }
      return;
    }

    setComposerBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission needed', 'Allow microphone access to record a voice note.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      Alert.alert('Recording failed', error instanceof Error ? error.message : 'Unable to start recording.');
    } finally {
      setComposerBusy(false);
    }
  }, [audioRecorder, composerBusy, conversationKey, convo, recorderState.durationMillis, recorderState.isRecording, sendConversationAttachment]);

  const addReaction = (msgId: string, reaction: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, reactions: m.reactions.includes(reaction) ? m.reactions.filter(r => r !== reaction) : [...m.reactions, reaction] }
        : m
    ));
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Dynamic background */}
      <ChatBackground theme={chatTheme} />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── CLEAN HEADER ── */}
        <View style={styles.header}>
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color={COLORS.text} />
          </TouchableOpacity>

          {/* User info */}
          <TouchableOpacity style={styles.headerUser} activeOpacity={0.85}>
            <View style={styles.headerAvatarWrap}>
              <LinearGradient colors={tierCfg.colors as any} style={styles.headerAvatarRing}>
                <Image source={{ uri: convo.user.avatar }} style={styles.headerAvatar} contentFit="cover" />
              </LinearGradient>
              {convo.user.online && <View style={styles.headerOnlineDot} />}
            </View>
            <View style={styles.headerUserText}>
              <Text style={styles.headerName}>{convo.user.name}</Text>
              <Text style={[styles.headerStatus, { color: moodCfg.color }]}>
                {moodCfg.icon} {convo.user.online ? 'Active now' : 'Offline'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Right actions: voice · video · ⋯ */}
          <View style={styles.headerActions}>
            <CallButton icon="call-outline" type="voice" onPress={() => void startVoiceCall()} />
            <CallButton icon="videocam-outline" type="video" onPress={() => void startVideoCall()} />
            <ThreeDotButton onPress={() => setShowMenu(true)} />
          </View>
        </View>

        {/* Focus mode subtle banner (state-driven, no dedicated button) */}
        {toggleStates.focus && (
          <View style={styles.focusBanner}>
            <View style={styles.focusBannerDot} />
            <Text style={styles.focusBannerText}>Focus Mode — notifications paused</Text>
          </View>
        )}

        {/* ── MESSAGES ── */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <MessageBubble msg={item} onReact={addReaction} />}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={typing ? <TypingIndicator /> : null}
          />

          {/* ── INPUT BAR ── */}
          <View style={[styles.inputBarWrap, { paddingBottom: bottomInputInset }]}>
            <LinearGradient
              colors={['rgba(5,7,15,0)', 'rgba(5,7,15,0.82)', 'rgba(5,7,15,0.97)']}
              style={styles.inputBarFade}
              pointerEvents="none"
            />
            <View style={styles.inputBar}>
              <TouchableOpacity
                style={[styles.inputActionBtn, composerBusy && styles.inputActionBtnDisabled]}
                onPress={() => void pickChatMedia()}
                disabled={composerBusy}
                activeOpacity={0.8}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Add attachment"
              >
                <Ionicons name="add" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>

              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Message..."
                  placeholderTextColor={COLORS.textMuted}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                />
                <TouchableOpacity
                  style={styles.inputEmojiBtn}
                  onPress={() => setShowEmojiTray((value) => !value)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Open emoji picker"
                >
                  <Ionicons name="happy-outline" size={18} color={showEmojiTray ? COLORS.primaryLight : COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {input.trim().length > 0 ? (
                <TouchableOpacity
                  onPress={() => void sendMessage()}
                  activeOpacity={0.85}
                  style={styles.sendBtnTouchTarget}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <LinearGradient
                    colors={['#818CF8', '#6366F1', '#8B5CF6']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.sendBtn}
                    pointerEvents="none"
                  >
                    <Ionicons name="arrow-up" size={18} color="white" />
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.inputActionBtn,
                    recorderState.isRecording && styles.inputActionBtnRecording,
                    composerBusy && styles.inputActionBtnDisabled
                  ]}
                  onPress={() => void toggleVoiceNote()}
                  disabled={composerBusy}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Record voice message"
                >
                  <Ionicons
                    name={recorderState.isRecording ? 'stop' : 'mic-outline'}
                    size={20}
                    color={recorderState.isRecording ? COLORS.white : COLORS.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>
            {recorderState.isRecording && (
              <View style={styles.recordingStrip}>
                <View style={styles.recordingDot} />
                <View style={styles.recordingWave}>
                  {Array.from({ length: 12 }).map((_, index) => (
                    <View
                      key={`recording-wave-${index}`}
                      style={[
                        styles.recordingWaveBar,
                        { height: 8 + ((index * 7 + Math.round(recorderState.durationMillis / 120)) % 18) }
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.recordingText}>{formatDuration(recorderState.durationMillis / 1000)}</Text>
                <Text style={styles.recordingHint}>Tap stop to send</Text>
              </View>
            )}
            {showEmojiTray && (
              <View style={styles.emojiTray}>
                {QUICK_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiChoice}
                    onPress={() => setInput((value) => `${value}${emoji}`)}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${emoji}`}
                  >
                    <Text style={styles.emojiChoiceText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Premium popup menu */}
      <MenuPopup
        visible={showMenu}
        toggleStates={toggleStates}
        onAction={handleMenuAction}
        onClose={() => setShowMenu(false)}
      />

      {/* Theme picker sheet */}
      <ThemeSheet
        visible={showThemeSheet}
        current={chatTheme}
        onSelect={setChatTheme}
        onClose={() => setShowThemeSheet(false)}
      />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.055)',
    backgroundColor: 'rgba(5,7,15,0.72)',
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatarWrap: { position: 'relative' },
  headerAvatarRing: {
    width: 42, height: 42, borderRadius: 14,
    padding: 2, alignItems: 'center', justifyContent: 'center',
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 11 },
  headerOnlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: COLORS.success,
    borderWidth: 2, borderColor: COLORS.bg,
  },
  headerUserText: { gap: 1 },
  headerName: {
    fontSize: FONTS.base, fontWeight: FONTS.semibold,
    color: COLORS.text, letterSpacing: 0.1,
  },
  headerStatus: { fontSize: FONTS.xs, fontWeight: FONTS.medium },

  // Right actions
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },

  // Call buttons
  callBtnWrap: {
    position: 'relative', width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  callBtnHalo: {
    position: 'absolute',
    width: 48, height: 48, borderRadius: 24,
  },
  callBtnGrad: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  // Three-dot button
  threeDotBtn: {
    width: 48, height: 48, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  threeDotInner: { flexDirection: 'row', gap: 3.5, alignItems: 'center' },
  dot: {
    width: 3.5, height: 3.5, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },

  // Focus banner (state-driven)
  focusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACE.md, paddingVertical: 7,
    backgroundColor: 'rgba(99,102,241,0.07)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(99,102,241,0.1)',
  },
  focusBannerDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary },
  focusBannerText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.medium, letterSpacing: 0.2 },

  // ── Messages ────────────────────────────────────────────────────────────────
  messagesList: {
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    paddingBottom: 24,
    gap: 2,
  },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 28, height: 28, borderRadius: 9 },
  msgBubbleWrap: { maxWidth: width * 0.72, gap: 4 },
  msgBubbleWrapMe: { alignItems: 'flex-end' },

  // Sent
  sentBubble: { position: 'relative' },
  sentBubbleGrad: {
    paddingHorizontal: 15, paddingVertical: 11,
    borderRadius: 20, borderBottomRightRadius: 5,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 7,
  },
  sentBubbleGlowEdge: {
    position: 'absolute',
    top: -1, left: -1, right: -1, bottom: -1,
    borderRadius: 21, borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.28)',
  },

  // Received
  recvBubble: {
    paddingHorizontal: 15, paddingVertical: 11,
    borderRadius: 20, borderBottomLeftRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },

  msgTextMe:   { fontSize: FONTS.base, color: '#FFFFFF',    lineHeight: 22, letterSpacing: 0.1 },
  msgTextThem: { fontSize: FONTS.base, color: COLORS.text,  lineHeight: 22, letterSpacing: 0.1 },
  msgTime:     { fontSize: 11, color: COLORS.textMuted, marginTop: 2, letterSpacing: 0.2 },
  msgTimeMe:   { textAlign: 'right' },
  voiceBubble: {
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceBubbleMe: {},
  voicePlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  voiceBody: { flex: 1, gap: 6 },
  waveform: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  voiceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceDuration: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: FONTS.semibold },
  voiceFailed: { color: COLORS.pink, fontSize: 11, fontWeight: FONTS.bold },
  mediaBubble: {
    width: Math.min(230, width * 0.58),
    aspectRatio: 0.9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  mediaBubbleMe: {},
  mediaPreview: { width: '100%', height: '100%' },
  fileBubble: {
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  fileBubbleMe: {},
  fileTitle: { color: COLORS.text, fontSize: FONTS.sm, fontWeight: FONTS.bold },
  fileName: { color: COLORS.textMuted, fontSize: FONTS.xs, marginTop: 2 },

  msgReactions:   { flexDirection: 'row', gap: 4, marginTop: 2 },
  msgReactionsMe: { justifyContent: 'flex-end' },
  reactionPill: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  reactionEmoji: { fontSize: 12 },

  reactionPicker:   { position: 'absolute', bottom: '100%', left: 0, zIndex: 10, marginBottom: 6 },
  reactionPickerMe: { left: 'auto', right: 0 },
  reactionPickerInner: {
    flexDirection: 'row', gap: 2, padding: 8,
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55, shadowRadius: 22, elevation: 16,
  },
  reactionOption:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  reactionOptionText: { fontSize: 21 },

  // Typing
  typingWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 6, paddingHorizontal: 4 },
  typingAvatar: { width: 28, height: 28, borderRadius: 9 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16, paddingVertical: 13,
    borderRadius: 20, borderBottomLeftRadius: 5,
  },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.42)' },

  // ── Input bar ───────────────────────────────────────────────────────────────
  inputBarWrap: { position: 'relative' },
  inputBarFade: { position: 'absolute', top: -44, left: 0, right: 0, height: 44 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACE.md, paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    gap: 10,
    backgroundColor: 'rgba(5,7,15,0.84)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.055)',
  },
  inputActionBtn: {
    width: 48, height: 48, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  inputActionBtnDisabled: {
    opacity: 0.45,
  },
  inputActionBtnRecording: {
    backgroundColor: 'rgba(236,72,153,0.72)',
    borderColor: 'rgba(236,72,153,0.95)',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  input: { flex: 1, fontSize: FONTS.base, color: COLORS.text, maxHeight: 100, lineHeight: 20 },
  inputEmojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -4,
  },
  emojiTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: SPACE.md,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'rgba(5,7,15,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  emojiChoice: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emojiChoiceText: { fontSize: 22 },
  recordingStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    backgroundColor: 'rgba(236,72,153,0.16)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(236,72,153,0.22)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.pink,
  },
  recordingText: {
    color: COLORS.text,
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    minWidth: 42,
  },
  recordingHint: {
    color: COLORS.textMuted,
    fontSize: FONTS.xs,
    fontWeight: FONTS.semibold,
  },
  recordingWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    minHeight: 28,
  },
  recordingWaveBar: {
    width: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  sendBtnTouchTarget: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },

  // ── Premium Popup Menu ───────────────────────────────────────────────────────
  popup: {
    position: 'absolute',
    top: 88,           // just below header
    right: SPACE.md,
    width: 258,
    // transform-origin top-right via transformOrigin not supported in RN,
    // so we anchor top-right by positioning and use scale from center
    zIndex: 999,
  },
  popupInner: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 30,
  },
  popupGlowEdge: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  popupSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 4,
    marginHorizontal: 14,
  },

  // Menu row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 0,
  },
  menuIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  menuIconNormal: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  menuIconDestructive: {
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  menuItemIcon: { fontSize: 15 },
  menuLabel: {
    flex: 1,
    fontSize: FONTS.sm,
    fontWeight: FONTS.medium,
    color: COLORS.textSub,
    letterSpacing: 0.1,
  },
  menuLabelDestructive: {
    color: 'rgba(239,68,68,0.85)',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 14,
  },

  // Toggle pill
  togglePill: {
    width: 36, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  togglePillOn: {
    backgroundColor: 'rgba(99,102,241,0.45)',
    borderColor: 'rgba(99,102,241,0.6)',
  },
  toggleThumb: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.45)',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    backgroundColor: COLORS.primaryLight,
    alignSelf: 'flex-end',
  },

  // ── Theme sheet ─────────────────────────────────────────────────────────────
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetInner: {
    borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.lg, paddingBottom: 44,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'center', marginBottom: SPACE.lg,
  },
  sheetTitle: {
    fontSize: FONTS.md, fontWeight: FONTS.bold,
    color: COLORS.text, letterSpacing: -0.2, marginBottom: 4,
  },
  sheetSub: { fontSize: FONTS.sm, color: COLORS.textMuted, marginBottom: SPACE.lg },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeItem: {
    width: (width - SPACE.lg * 2 - 10) / 2,
    paddingVertical: 18, paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', gap: 8,
    position: 'relative',
  },
  themeItemIcon:  { fontSize: 28 },
  themeItemLabel: { fontSize: FONTS.sm, color: COLORS.textSub, fontWeight: FONTS.semibold },
  themeItemCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
});
