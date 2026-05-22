import { MoodType, StatusType, TierType } from './theme';

export const ME = {
  id: 'me',
  name: 'Kryno User',
  handle: '@kryno',
  avatar: 'https://api.dicebear.com/9.x/initials/png?seed=KRYNO&backgroundColor=111827&fontColor=e5e7eb',
  bio: '',
  bioKeywords: [] as string[],
  tier: 'Basic' as TierType,
  joinDate: 'Today',
  status: 'active' as StatusType,
  mood: 'chill' as MoodType,
  interests: [] as string[],
  identityTags: [] as string[],
  stats: { posts: 0, followers: 0, following: 0, visits: 0 },
  music: { title: '', artist: '', progress: 0, duration: '' }
};

type FeedPostSeed = {
  id: string;
  user: {
    name: string;
    handle: string;
    avatar: string;
    tier: TierType;
  };
  image: string;
  caption: string;
  captionKeywords: string[];
  timeAgo: string;
  likes: number;
  comments: number;
  locked: boolean;
  mood: MoodType;
};

export const FEED_POSTS: FeedPostSeed[] = [];

export const DISCOVER_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'design', label: 'Design' },
  { id: 'travel', label: 'Travel' },
  { id: 'mood', label: 'Mood' },
  { id: 'music', label: 'Music' },
  { id: 'film', label: 'Film' }
];

type DiscoverPostSeed = {
  id: string;
  image: string;
  category: string;
  tall: boolean;
  likes: number;
};

export const DISCOVER_POSTS: DiscoverPostSeed[] = [];

type FeaturedMemberSeed = {
  id: string;
  name: string;
  handle: string;
  tier: TierType;
  avatar: string;
  mood: MoodType;
  online: boolean;
};

export const FEATURED_MEMBERS: FeaturedMemberSeed[] = [];

type ConversationSeed = {
  id: string;
  user: {
    name: string;
    handle: string;
    avatar: string;
    tier: TierType;
    online: boolean;
    mood: MoodType;
  };
  lastMessage: string;
  time: string;
  unread: number;
  pinned: boolean;
};

export const CONVERSATIONS: ConversationSeed[] = [];

type MessageSeed = {
  id: string;
  from: 'me' | 'them';
  text: string;
  time: string;
  reactions: string[];
};

export const MESSAGES: MessageSeed[] = [];

type ProfilePostSeed = {
  id: string;
  image: string;
  locked: boolean;
  likes: number;
  comments: number;
  tall: boolean;
};

export const PROFILE_POSTS: ProfilePostSeed[] = [];

type StorySeed = {
  id: string;
  label: string;
  isAdd: boolean;
  gradient: string[];
  avatar?: string;
};

export const STORIES: StorySeed[] = [
  { id: 'add-story', label: 'Add', isAdd: true, gradient: ['#6366F1', '#8B5CF6'] as string[] }
];
