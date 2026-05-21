import { MoodType, StatusType, TierType } from './theme';

// ─── CURRENT USER ────────────────────────────────────────────────────────────
export const ME = {
  id: 'me',
  name: 'Aryan Mehta',
  handle: '@aryan.kryno',
  avatar: 'https://i.pravatar.cc/300?img=68',
  bio: 'Architect of ideas. Collector of rare moments.\nObsessed with craft, silence, and things that last.',
  bioKeywords: ['craft', 'silence', 'rare moments'],
  tier: 'Inner Circle' as TierType,
  joinDate: 'Jan 2026',
  status: 'active' as StatusType,
  mood: 'chill' as MoodType,
  interests: ['Design', 'Architecture', 'Film', 'Jazz', 'Philosophy'],
  identityTags: ['Aesthetic ✨', 'Minimalist', 'Night Owl 🌙', 'Creative 🎨'],
  stats: { posts: 47, followers: 1240, following: 88, visits: 312 },
  music: { title: 'Midnight City', artist: 'M83', progress: 0.42, duration: '4:03' },
};

// ─── FEED POSTS ──────────────────────────────────────────────────────────────
export const FEED_POSTS = [
  {
    id: 'f1',
    user: { name: 'Zara Khan', handle: '@zara.k', avatar: 'https://i.pravatar.cc/100?img=47', tier: 'Inner Circle' as TierType },
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    caption: 'There is beauty in the in-between. The pause. The breath.',
    captionKeywords: ['beauty', 'pause'],
    timeAgo: '2h',
    likes: 284,
    comments: 31,
    locked: false,
    mood: 'chill' as MoodType,
  },
  {
    id: 'f2',
    user: { name: 'Dev Sharma', handle: '@dev.sh', avatar: 'https://i.pravatar.cc/100?img=33', tier: 'Elite' as TierType },
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
    caption: 'Late night sessions. The city hums at a different frequency.',
    captionKeywords: ['frequency'],
    timeAgo: '4h',
    likes: 156,
    comments: 18,
    locked: false,
    mood: 'focus' as MoodType,
  },
  {
    id: 'f3',
    user: { name: 'Priya Nair', handle: '@priya.n', avatar: 'https://i.pravatar.cc/100?img=45', tier: 'Inner Circle' as TierType },
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    caption: 'Inner Circle exclusive — only for those who belong.',
    captionKeywords: ['belong'],
    timeAgo: '5h',
    likes: 0,
    comments: 0,
    locked: true,
    mood: 'chill' as MoodType,
  },
  {
    id: 'f4',
    user: { name: 'Kabir Sen', handle: '@kabir.s', avatar: 'https://i.pravatar.cc/100?img=52', tier: 'Elite' as TierType },
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
    caption: 'The playlist that shaped this week. Some things just hit different at 2am.',
    captionKeywords: ['playlist', '2am'],
    timeAgo: '8h',
    likes: 423,
    comments: 52,
    locked: false,
    mood: 'social' as MoodType,
  },
  {
    id: 'f5',
    user: { name: 'Aisha Malik', handle: '@aisha.m', avatar: 'https://i.pravatar.cc/100?img=49', tier: 'Inner Circle' as TierType },
    image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800',
    caption: 'Tokyo after midnight. A city that never forgets to breathe.',
    captionKeywords: ['breathe'],
    timeAgo: '12h',
    likes: 318,
    comments: 44,
    locked: false,
    mood: 'chill' as MoodType,
  },
];

// ─── DISCOVER ────────────────────────────────────────────────────────────────
export const DISCOVER_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'design', label: 'Design' },
  { id: 'travel', label: 'Travel' },
  { id: 'mood', label: 'Mood' },
  { id: 'music', label: 'Music' },
  { id: 'film', label: 'Film' },
];

export const DISCOVER_POSTS = [
  { id: 'd1', image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600', category: 'design', tall: true, likes: 284 },
  { id: 'd2', image: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600', category: 'travel', tall: false, likes: 156 },
  { id: 'd3', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600', category: 'music', tall: false, likes: 423 },
  { id: 'd4', image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600', category: 'travel', tall: true, likes: 318 },
  { id: 'd5', image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600', category: 'mood', tall: false, likes: 201 },
  { id: 'd6', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600', category: 'travel', tall: true, likes: 512 },
  { id: 'd7', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600', category: 'music', tall: false, likes: 189 },
  { id: 'd8', image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600', category: 'music', tall: false, likes: 267 },
];

export const FEATURED_MEMBERS = [
  { id: 'm1', name: 'Zara Khan', handle: '@zara.k', tier: 'Inner Circle' as TierType, avatar: 'https://i.pravatar.cc/150?img=47', mood: 'chill' as MoodType, online: true },
  { id: 'm2', name: 'Dev Sharma', handle: '@dev.sh', tier: 'Elite' as TierType, avatar: 'https://i.pravatar.cc/150?img=33', mood: 'focus' as MoodType, online: true },
  { id: 'm3', name: 'Priya Nair', handle: '@priya.n', tier: 'Inner Circle' as TierType, avatar: 'https://i.pravatar.cc/150?img=45', mood: 'social' as MoodType, online: false },
  { id: 'm4', name: 'Rishi Patel', handle: '@rishi.p', tier: 'Basic' as TierType, avatar: 'https://i.pravatar.cc/150?img=12', mood: 'chill' as MoodType, online: true },
  { id: 'm5', name: 'Aisha Malik', handle: '@aisha.m', tier: 'Inner Circle' as TierType, avatar: 'https://i.pravatar.cc/150?img=49', mood: 'social' as MoodType, online: false },
  { id: 'm6', name: 'Kabir Sen', handle: '@kabir.s', tier: 'Elite' as TierType, avatar: 'https://i.pravatar.cc/150?img=52', mood: 'focus' as MoodType, online: true },
];

// ─── CONVERSATIONS ───────────────────────────────────────────────────────────
export const CONVERSATIONS = [
  {
    id: 'c1',
    user: { name: 'Zara Khan', handle: '@zara.k', avatar: 'https://i.pravatar.cc/150?img=47', tier: 'Inner Circle' as TierType, online: true, mood: 'chill' as MoodType },
    lastMessage: 'That photo from last night was incredible ✦',
    time: '2m',
    unread: 3,
    pinned: true,
  },
  {
    id: 'c2',
    user: { name: 'Dev Sharma', handle: '@dev.sh', avatar: 'https://i.pravatar.cc/150?img=33', tier: 'Elite' as TierType, online: true, mood: 'focus' as MoodType },
    lastMessage: 'The new design direction is exactly right.',
    time: '1h',
    unread: 0,
    pinned: true,
  },
  {
    id: 'c3',
    user: { name: 'Priya Nair', handle: '@priya.n', avatar: 'https://i.pravatar.cc/150?img=45', tier: 'Inner Circle' as TierType, online: false, mood: 'social' as MoodType },
    lastMessage: 'See you at the rooftop gathering 🌙',
    time: '3h',
    unread: 1,
    pinned: false,
  },
  {
    id: 'c4',
    user: { name: 'Kabir Sen', handle: '@kabir.s', avatar: 'https://i.pravatar.cc/150?img=52', tier: 'Elite' as TierType, online: false, mood: 'focus' as MoodType },
    lastMessage: 'Shared a playlist with you',
    time: '1d',
    unread: 0,
    pinned: false,
  },
  {
    id: 'c5',
    user: { name: 'Aisha Malik', handle: '@aisha.m', avatar: 'https://i.pravatar.cc/150?img=49', tier: 'Inner Circle' as TierType, online: true, mood: 'chill' as MoodType },
    lastMessage: 'Tokyo was everything I imagined.',
    time: '2d',
    unread: 0,
    pinned: false,
  },
];

export const MESSAGES = [
  { id: 'msg1', from: 'them', text: 'Just saw your new post. The composition is stunning.', time: '10:42', reactions: [] },
  { id: 'msg2', from: 'me', text: 'Thank you — spent hours getting the light right.', time: '10:44', reactions: ['✦'] },
  { id: 'msg3', from: 'them', text: 'It shows. There\'s a stillness to it that\'s rare.', time: '10:45', reactions: [] },
  { id: 'msg4', from: 'me', text: 'That\'s exactly what I was going for. The pause between moments.', time: '10:47', reactions: ['🌙'] },
  { id: 'msg5', from: 'them', text: 'That photo from last night was incredible ✦', time: '11:02', reactions: [] },
  { id: 'msg6', from: 'them', text: 'Are you coming to the rooftop gathering this weekend?', time: '11:03', reactions: [] },
];

// ─── PROFILE POSTS ───────────────────────────────────────────────────────────
export const PROFILE_POSTS = [
  { id: 'p1', image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500', locked: false, likes: 284, comments: 31, tall: true },
  { id: 'p2', image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500', locked: false, likes: 156, comments: 18, tall: false },
  { id: 'p3', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500', locked: true, likes: 0, comments: 0, tall: false },
  { id: 'p4', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500', locked: false, likes: 423, comments: 52, tall: true },
  { id: 'p5', image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=500', locked: true, likes: 0, comments: 0, tall: false },
  { id: 'p6', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500', locked: false, likes: 198, comments: 24, tall: false },
];

export const STORIES = [
  { id: 's0', label: 'Add', isAdd: true, gradient: ['#6366F1', '#8B5CF6'] as string[] },
  { id: 's1', label: 'Tokyo', isAdd: false, gradient: ['#06B6D4', '#6366F1'] as string[], avatar: 'https://i.pravatar.cc/100?img=47' },
  { id: 's2', label: 'Night', isAdd: false, gradient: ['#EC4899', '#8B5CF6'] as string[], avatar: 'https://i.pravatar.cc/100?img=33' },
  { id: 's3', label: 'Studio', isAdd: false, gradient: ['#F59E0B', '#EF4444'] as string[], avatar: 'https://i.pravatar.cc/100?img=45' },
  { id: 's4', label: 'Drive', isAdd: false, gradient: ['#10B981', '#06B6D4'] as string[], avatar: 'https://i.pravatar.cc/100?img=52' },
];
