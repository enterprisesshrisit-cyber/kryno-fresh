import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACE } from '../lib/theme';

type StoryViewerItem = {
  id: string;
  isAdd?: boolean;
  label?: string;
  avatar?: string;
  gradient?: string[];
  mediaUrl?: string;
  mediaMimeType?: string;
  caption?: string;
  username?: string;
  viewCount?: number;
};

type Props = {
  visible: boolean;
  stories: StoryViewerItem[];
  initialStoryId?: string | null;
  onClose: () => void;
  onMarkViewed?: (storyId: string) => Promise<void>;
};

export default function StoryViewerModal({ visible, stories, initialStoryId, onClose, onMarkViewed }: Props) {
  const visibleStories = useMemo(() => stories.filter((story) => story && !story.isAdd), [stories]);
  const [index, setIndex] = useState(0);
  const markedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextIndex = Math.max(0, visibleStories.findIndex((story) => story.id === initialStoryId));
    setIndex(nextIndex);
  }, [initialStoryId, visible, visibleStories]);

  const currentStory = visibleStories[index] ?? null;

  const goNext = useCallback(() => {
    if (index < visibleStories.length - 1) {
      setIndex((current) => current + 1);
    } else {
      onClose();
    }
  }, [index, onClose, visibleStories.length]);

  const goPrevious = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    if (!visible || !currentStory?.id) {
      return;
    }

    if (!markedRef.current.has(currentStory.id)) {
      markedRef.current.add(currentStory.id);
      void onMarkViewed?.(currentStory.id);
    }

    const timeout = setTimeout(goNext, 5000);
    return () => clearTimeout(timeout);
  }, [currentStory?.id, goNext, onMarkViewed, visible]);

  if (!currentStory) {
    return null;
  }

  const isVideo = currentStory.mediaMimeType?.startsWith('video/');
  const mediaUrl = currentStory.mediaUrl || currentStory.avatar || '';
  const gradient = Array.isArray(currentStory.gradient) && currentStory.gradient.length >= 2
    ? currentStory.gradient
    : ['#6366F1', '#8B5CF6'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <LinearGradient colors={['rgba(5,7,15,0.96)', 'rgba(8,10,20,0.98)']} style={StyleSheet.absoluteFill} />

        <View style={styles.progressRow}>
          {visibleStories.map((story, storyIndex) => (
            <View key={story.id} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: storyIndex <= index ? '100%' : '0%' }
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.header}>
          <View style={styles.authorRow}>
            <LinearGradient colors={gradient as any} style={styles.avatarRing}>
              <Image source={{ uri: currentStory.avatar || mediaUrl }} style={styles.avatar} contentFit="cover" />
            </LinearGradient>
            <View style={styles.authorText}>
              <Text style={styles.authorName}>{currentStory.label || currentStory.username || 'Story'}</Text>
              <Text style={styles.authorMeta}>
                {currentStory.viewCount != null ? `${currentStory.viewCount} views` : 'Kryno story'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.mediaFrame}>
          {isVideo ? (
            <View style={styles.videoFallback}>
              <Ionicons name="videocam-outline" size={42} color={COLORS.primary} />
              <Text style={styles.videoTitle}>Video story</Text>
              <Text style={styles.videoCopy}>Video playback will be added after the media player dependency is enabled.</Text>
            </View>
          ) : mediaUrl ? (
            <Image source={{ uri: mediaUrl }} style={styles.media} contentFit="contain" />
          ) : (
            <View style={styles.videoFallback}>
              <Ionicons name="image-outline" size={42} color={COLORS.primary} />
              <Text style={styles.videoTitle}>Story media unavailable</Text>
            </View>
          )}
        </View>

        {currentStory.caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.caption}>{currentStory.caption}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.previousTap} onPress={goPrevious} activeOpacity={1} />
        <TouchableOpacity style={styles.nextTap} onPress={goNext} activeOpacity={1} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  progressRow: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: SPACE.md,
    paddingTop: 18
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)'
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary
  },
  header: {
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 3
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    padding: 2
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 19
  },
  authorText: {
    gap: 2
  },
  authorName: {
    color: COLORS.text,
    fontSize: FONTS.base,
    fontWeight: FONTS.bold
  },
  authorMeta: {
    color: COLORS.textMuted,
    fontSize: FONTS.xs
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  mediaFrame: {
    flex: 1,
    padding: SPACE.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  media: {
    width: '100%',
    height: '100%'
  },
  videoFallback: {
    width: '100%',
    minHeight: 260,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.lg,
    gap: 10
  },
  videoTitle: {
    color: COLORS.text,
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold
  },
  videoCopy: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm,
    lineHeight: 20,
    textAlign: 'center'
  },
  captionWrap: {
    paddingHorizontal: SPACE.md,
    paddingBottom: 34
  },
  caption: {
    color: COLORS.text,
    fontSize: FONTS.base,
    lineHeight: 22,
    textAlign: 'center'
  },
  previousTap: {
    position: 'absolute',
    left: 0,
    top: 90,
    bottom: 80,
    width: '34%',
    zIndex: 2
  },
  nextTap: {
    position: 'absolute',
    right: 0,
    top: 90,
    bottom: 80,
    width: '34%',
    zIndex: 2
  }
});
