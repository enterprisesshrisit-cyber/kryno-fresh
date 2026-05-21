import krynoSymbolicLogo from './assets/kryno-symbolic-logo.png';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CallLogRecord, ConversationSummary, LocalMessageRecord } from './lib/signalStore';
import type { CallMode } from './lib/callClient';
import type { SocialPost, SocialProfile, SocialStory } from './lib/socialClient';

type SearchUserResult = {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
};

type RelayStatus = 'offline' | 'connecting' | 'connected' | 'error';

type SessionShape = {
  user: {
    username: string;
    email: string;
  };
} | null;

type CallStateShape = {
  callId: string;
  direction: 'incoming' | 'outgoing';
  phase: 'ringing' | 'connecting' | 'reconnecting' | 'connected';
  mode: CallMode;
  remoteLabel: string;
  remoteSessionId: string | null;
  muted: boolean;
  speakerMuted: boolean;
  cameraEnabled: boolean;
  ringtoneSilenced: boolean;
  status: string;
  startedAt: string;
  connectedAt?: string;
} | null;

type AttachmentViewerShape = {
  fileName: string;
  mimeType: string;
  objectUrl: string;
  sizeLabel: string;
  previewKind: 'image' | 'pdf' | 'document';
} | null;

type KrynoMobileAppProps = {
  activeConversationKey: string;
  attachmentDraft: File | null;
  attachmentViewer: AttachmentViewerShape;
  busy: boolean;
  callState: CallStateShape;
  callHistory: CallLogRecord[];
  conversationTimeline: Array<
    | {
        id: string;
        createdAt: string;
        type: 'message';
        message: LocalMessageRecord;
      }
    | {
        id: string;
        createdAt: string;
        type: 'call';
        call: CallLogRecord;
      }
  >;
  conversationSummaries: ConversationSummary[];
  error: string;
  localCallStream: MediaStream | null;
  messageDraft: string;
  messages: LocalMessageRecord[];
  notice: string;
  onAttachmentSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onAcceptCall: () => void;
  onAddPostComment: (postId: string) => void;
  onCloseAttachmentPreview: () => void;
  onClearSelectedThread: () => void;
  onCreatePost: (event: FormEvent<HTMLFormElement>) => void;
  onCreateStory: (event: FormEvent<HTMLFormElement>) => void;
  onDeletePost: (post: SocialPost) => void;
  onDownloadAttachmentPreview: () => void;
  onEndCall: () => void;
  onLogout: () => void;
  onMessageDraftChange: (value: string) => void;
  onOpenStory: (storyId: string) => void;
  onOpenAttachment: (message: LocalMessageRecord) => void;
  onPostComposerChange: (value: {
    caption: string;
    visibility: 'public' | 'followers';
    mediaFile: File | null;
  }) => void;
  onPostCommentDraftChange: (postId: string, value: string) => void;
  onPostMediaSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onProfileAvatarSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onProfileFormChange: (value: {
    displayName: string;
    bio: string;
    avatarFile: File | null;
  }) => void;
  onRecipientLookupChange: (value: string) => void;
  onRefresh: () => void;
  onRejectCall: () => void;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSelectThread: (conversationKey: string) => void;
  onSendAttachment: () => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onSilenceRingtone: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onStoryComposerChange: (value: {
    caption: string;
    visibility: 'public' | 'followers' | 'private_circle';
    mediaFile: File | null;
  }) => void;
  onStoryMediaSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleCallMute: () => void;
  onToggleCamera: () => void;
  onToggleFollow: (profile: SocialProfile) => void;
  onTogglePostLike: (post: SocialPost) => void;
  onToggleSpeakerMute: () => void;
  postCommentDrafts: Record<string, string>;
  postComposer: {
    caption: string;
    visibility: 'public' | 'followers';
    mediaFile: File | null;
  };
  profileForm: {
    displayName: string;
    bio: string;
    avatarFile: File | null;
  };
  recipientLookup: string;
  recipientResults: SearchUserResult[];
  recipientSearchBusy: boolean;
  relayStatus: RelayStatus;
  remoteCallStream: MediaStream | null;
  selectedConversation: string;
  session: SessionShape;
  signalReady: boolean;
  postBusy: boolean;
  profileBusy: boolean;
  socialFeed: SocialPost[];
  followBusyUsers: string[];
  socialMe: SocialProfile | null;
  socialStories: SocialStory[];
  socialSuggestions: SocialProfile[];
  storyBusy: boolean;
  storyComposer: {
    caption: string;
    visibility: 'public' | 'followers' | 'private_circle';
    mediaFile: File | null;
  };
};

export function KrynoMobileApp({
  activeConversationKey,
  attachmentDraft,
  attachmentViewer,
  busy,
  callState,
  callHistory,
  conversationTimeline,
  conversationSummaries,
  error,
  localCallStream,
  messageDraft,
  messages,
  notice,
  onAttachmentSelected,
  onAcceptCall,
  onAddPostComment,
  onCloseAttachmentPreview,
  onClearSelectedThread,
  onCreatePost,
  onCreateStory,
  onDeletePost,
  onDownloadAttachmentPreview,
  onEndCall,
  onLogout,
  onMessageDraftChange,
  onOpenStory,
  onOpenAttachment,
  onPostComposerChange,
  onPostCommentDraftChange,
  onPostMediaSelected,
  onProfileAvatarSelected,
  onProfileFormChange,
  onRecipientLookupChange,
  onRefresh,
  onRejectCall,
  onSaveProfile,
  onSelectThread,
  onSendAttachment,
  onSendMessage,
  onSilenceRingtone,
  onStartAudioCall,
  onStartVideoCall,
  onStoryComposerChange,
  onStoryMediaSelected,
  onToggleCallMute,
  onToggleCamera,
  onToggleFollow,
  onTogglePostLike,
  onToggleSpeakerMute,
  postCommentDrafts,
  postComposer,
  profileForm,
  recipientLookup,
  recipientResults,
  recipientSearchBusy,
  relayStatus,
  remoteCallStream,
  selectedConversation,
  session,
  signalReady,
  postBusy,
  profileBusy,
  socialFeed,
  followBusyUsers,
  socialMe,
  socialStories,
  socialSuggestions,
  storyBusy,
  storyComposer
}: KrynoMobileAppProps) {
  const [tab, setTab] = useState<'home' | 'discover' | 'club' | 'profile'>('home');
  const [commentPost, setCommentPost] = useState<string | null>(null);
  const [discoverFilter, setDiscoverFilter] = useState<'all' | 'elite' | 'inner'>('all');
  const [unlockedClubPosts, setUnlockedClubPosts] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const createSectionRef = useRef<HTMLDivElement | null>(null);
  const profileEditorRef = useRef<HTMLDivElement | null>(null);
  const privateChatActive = tab === 'discover' && Boolean(activeConversationKey);
  const profileAvatarPreviewUrl = useMemo(() => {
    if (profileForm.avatarFile) {
      return URL.createObjectURL(profileForm.avatarFile);
    }

    return socialMe?.avatarUrl ?? null;
  }, [profileForm.avatarFile, socialMe?.avatarUrl]);

  const activeComments = socialFeed.find((post) => post.id === commentPost)?.comments ?? [];
  const summaryItems = useMemo(() => conversationSummaries, [conversationSummaries]);
  const profileHandle = socialMe?.username ?? session?.user.username ?? 'kryno';
  const profileDisplayName = socialMe?.displayName?.trim() || session?.user.username || 'Kryno';
  const profileBio = socialMe?.bio?.trim() || 'Add a short intro so people know who you are.';
  const spotlightPost = socialFeed[0] ?? null;
  const mediaPostCount = useMemo(() => socialFeed.filter((post) => Boolean(post.mediaUrl)).length, [socialFeed]);
  const activeCreatorCount = useMemo(() => new Set(socialFeed.map((post) => post.author.username)).size, [socialFeed]);
  const myStory = useMemo(
    () => socialStories.find((story) => story.author.username === session?.user.username) ?? null,
    [session?.user.username, socialStories]
  );
  const myStories = useMemo(
    () => socialStories.filter((story) => story.author.username === profileHandle),
    [profileHandle, socialStories]
  );
  const otherStories = useMemo(
    () => socialStories.filter((story) => story.author.username !== session?.user.username),
    [session?.user.username, socialStories]
  );
  const myPosts = useMemo(
    () => socialFeed.filter((post) => post.author.username === profileHandle),
    [profileHandle, socialFeed]
  );
  const activeConversationSummary = useMemo(
    () => conversationSummaries.find((conversation) => conversation.conversationKey === activeConversationKey) ?? null,
    [activeConversationKey, conversationSummaries]
  );
  const firstName = profileDisplayName.split(' ')[0] || profileDisplayName;
  const discoverProfiles = useMemo(() => {
    const base = socialSuggestions.length > 0 ? socialSuggestions : Array.from(new Map(
      socialFeed.map((post) => [post.author.username, {
        userId: post.author.username,
        username: post.author.username,
        displayName: post.author.displayName,
        avatarUrl: post.author.avatarUrl ?? null,
        bio: '',
        followersCount: post.likeCount * 3,
        followingCount: Math.max(8, post.commentCount + 5),
        isFollowing: false
      }])
    ).values());

    return base.map((profile, index) => ({
      ...profile,
      tier: index % 3 === 0 ? 'Inner Circle' : index % 2 === 0 ? 'Elite' : 'Basic'
    }));
  }, [socialFeed, socialSuggestions]);
  const filteredDiscoverProfiles = useMemo(() => {
    const query = recipientLookup.trim().toLowerCase();
    return discoverProfiles.filter((profile) => {
      const matchesQuery =
        !query ||
        profile.displayName.toLowerCase().includes(query) ||
        profile.username.toLowerCase().includes(query);
      const matchesTier =
        discoverFilter === 'all' ||
        (discoverFilter === 'elite' && profile.tier === 'Elite') ||
        (discoverFilter === 'inner' && profile.tier === 'Inner Circle');
      return matchesQuery && matchesTier;
    });
  }, [discoverFilter, discoverProfiles, recipientLookup]);
  const clubPosts = useMemo(() => {
    return socialFeed
      .filter((post, index) => post.visibility !== 'public' || index % 2 === 0)
      .map((post, index) => ({
        ...post,
        clubLocked: index % 2 === 0
      }));
  }, [socialFeed]);
  const openSearch = () => {
    setTab('discover');
    window.setTimeout(() => searchInputRef.current?.focus(), 120);
  };

  const openCreate = () => {
    setTab('profile');
    window.setTimeout(() => createSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const openProfileEditor = () => {
    setTab('profile');
    window.setTimeout(() => profileEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  useEffect(() => {
    if (!profileForm.avatarFile || !profileAvatarPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => URL.revokeObjectURL(profileAvatarPreviewUrl);
  }, [profileAvatarPreviewUrl, profileForm.avatarFile]);

  return (
    <section className={privateChatActive ? 'workspace-shell sanctuary-shell private-chat-mode' : 'workspace-shell sanctuary-shell'}>
      {tab === 'home' && (
        <section className="surface-grid">
          <div className="surface-main">
            <section className="exact-home-header">
              <div>
                <p>Good evening,</p>
                <h1>{firstName}</h1>
              </div>
              <button className="sanctuary-notification-button" type="button" aria-label="Notifications">
                <KrynoNotificationIcon />
              </button>
            </section>

            <section className="feed-master-hero">
              <div className="feed-hero-primary panel compact-panel">
                <div className="feed-hero-copy">
                  <span className="premium-eyebrow">Kryno feed</span>
                  <h1 className="premium-page-title">A social feed that feels alive, not assembled.</h1>
                  <p className="premium-page-subtitle">
                    Stories first, premium media cards, and a profile-driven rhythm that keeps the product feeling intentional.
                  </p>

                  <div className="stories-strip stories-strip-premium">
                    <button
                      className={myStory ? 'story-avatar story-avatar-add live' : 'story-avatar story-avatar-add'}
                      onClick={() => (myStory ? onOpenStory(myStory.id) : openCreate())}
                      type="button"
                    >
                      <span className="story-avatar-shell">
                        {myStory?.author.avatarUrl ? (
                          <img alt={myStory.author.displayName} className="story-avatar-image" src={myStory.author.avatarUrl} />
                        ) : (
                          <span>{session?.user.username?.slice(0, 1) ?? 'Y'}</span>
                        )}
                        <i className="story-add-badge">+</i>
                      </span>
                      <small>{myStory ? 'Your story' : 'Add story'}</small>
                    </button>

                    {otherStories.map((story, index) => (
                      <motion.button
                        key={story.id}
                        className={story.viewedByMe ? 'story-avatar viewed' : 'story-avatar live'}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => onOpenStory(story.id)}
                        type="button"
                      >
                        {story.author.avatarUrl ? (
                          <img alt={story.author.displayName} className="story-avatar-image" src={story.author.avatarUrl} />
                        ) : (
                          <span>{story.author.displayName.slice(0, 1)}</span>
                        )}
                        <small>{story.author.username}</small>
                      </motion.button>
                    ))}

                    {otherStories.length === 0 && (
                      <div className="story-empty-copy">No stories from people you follow yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="feed-hero-side">
                <div className="panel compact-panel feed-hero-stat">
                  <span className="premium-eyebrow">Live pulse</span>
                  <strong>{activeCreatorCount || 0} active creators</strong>
                  <p>{mediaPostCount} media posts are shaping the timeline right now.</p>
                </div>
                <div className="panel compact-panel feed-hero-stat">
                  <span className="premium-eyebrow">Your profile</span>
                  <strong>{profileDisplayName}</strong>
                  <p>
                    {socialMe?.followersCount ?? 0} followers · {socialMe?.followingCount ?? 0} following
                  </p>
                </div>
                <div className="panel compact-panel feed-hero-spotlight">
                  <span className="premium-eyebrow">Spotlight</span>
                  <strong>{spotlightPost?.author.displayName || 'Your network'} leads the feed</strong>
                  <p>{spotlightPost?.caption?.trim() || 'Your strongest post should feel like an event, not filler.'}</p>
                </div>
              </div>
            </section>

            <div className="feed-list">
              {socialFeed.length === 0 && <div className="empty-thread-card">No posts yet. Add your first post from the Profile tab.</div>}
              {socialFeed.map((post) => (
                <article key={post.id} className="feed-card">
                  <header className="feed-card-header">
                    <div className="feed-user">
                      <span className="feed-avatar">
                        {post.author.avatarUrl ? (
                          <img alt={post.author.displayName} className="feed-avatar-image" src={post.author.avatarUrl} />
                        ) : (
                          post.author.displayName.slice(0, 1)
                        )}
                      </span>
                      <div>
                        <strong>{post.author.displayName}</strong>
                        <small>
                          @{post.author.username} - {formatRelativeTime(post.createdAt)}
                        </small>
                      </div>
                    </div>
                    <div className="feed-card-meta">
                      <span className="status-pill">{post.visibility === 'followers' ? 'Followers' : 'Public'}</span>
                      {socialMe?.username === post.author.username && (
                        <button className="post-delete-button" onClick={() => onDeletePost(post)} type="button">
                          Delete
                        </button>
                      )}
                    </div>
                  </header>

                  {post.mediaUrl && (
                    <div className="feed-media">
                      {post.mediaKind === 'video' ? (
                        <video className="feed-media-asset" controls muted playsInline src={post.mediaUrl} />
                      ) : (
                        <img alt={post.caption || post.author.displayName} className="feed-media-asset" src={post.mediaUrl} />
                      )}
                    </div>
                  )}

                  <div className="feed-actions">
                    <div className="feed-actions-left">
                      <button className={post.likedByMe ? 'active' : ''} onClick={() => onTogglePostLike(post)} type="button">
                        <HeartIcon filled={post.likedByMe} />
                      </button>
                      <button onClick={() => setCommentPost(post.id)} type="button">
                        <CommentIcon />
                      </button>
                      <button type="button">
                        <ShareIcon />
                      </button>
                    </div>
                    <button onClick={() => setCommentPost(post.id)} type="button">
                      <BookmarkIcon filled={false} />
                    </button>
                  </div>

                  <div className="feed-meta">
                    <strong>{post.likeCount.toLocaleString()} likes</strong>
                    {post.caption ? <p>{post.caption}</p> : <p className="feed-empty-caption">Media post</p>}
                    <button onClick={() => setCommentPost(post.id)} type="button">
                      View {post.commentCount} comments
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {commentPost && (
              <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.section
                  className="comment-drawer"
                  initial={{ y: 220 }}
                  animate={{ y: 0 }}
                  exit={{ y: 220 }}
                  transition={{ type: 'spring', stiffness: 130, damping: 18 }}
                >
                  <div className="drawer-handle" />
                  <div className="drawer-header">
                    <div>
                      <span className="label-chip">Comments</span>
                      <h4>Recent replies</h4>
                    </div>
                    <button onClick={() => setCommentPost(null)} type="button">
                      Close
                    </button>
                  </div>
                  <div className="comment-list">
                    {activeComments.map((comment) => (
                      <article key={comment.id} className="comment-item">
                        <span className="comment-avatar">{comment.displayName.slice(0, 1)}</span>
                        <div>
                          <header>
                            <strong>{comment.displayName}</strong>
                            <small>{formatRelativeTime(comment.createdAt)}</small>
                          </header>
                          <p>{comment.body}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  {commentPost && (
                    <div className="comment-composer">
                      <textarea
                        placeholder="Add a comment"
                        rows={3}
                        value={postCommentDrafts[commentPost] ?? ''}
                        onChange={(event) => onPostCommentDraftChange(commentPost, event.target.value)}
                      />
                      <button className="primary-button" onClick={() => onAddPostComment(commentPost)} type="button">
                        Add comment
                      </button>
                    </div>
                  )}
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {tab === 'discover' && (
        <section className={activeConversationKey ? 'chat-shell thread-active discover-shell' : 'chat-shell inbox-only discover-shell'}>
          <aside className="chat-browser-card">
            <div className="chat-browser-header">
              <div className="chat-browser-title-block">
                <span className="premium-eyebrow">Discover</span>
                <h2>Find members</h2>
              </div>
              <div className="chat-browser-count">{filteredDiscoverProfiles.length} members</div>
            </div>

            <label className="chat-search">
              <SearchIcon />
              <input
                ref={searchInputRef}
                placeholder="Search members..."
                value={recipientLookup}
                onChange={(event) => onRecipientLookupChange(event.target.value)}
              />
            </label>

            <div className="discover-filter-row">
              {[
                { key: 'all', label: 'All Members' },
                { key: 'elite', label: 'Elite' },
                { key: 'inner', label: 'Inner Circle' }
              ].map((filter) => (
                <button
                  key={filter.key}
                  className={discoverFilter === filter.key ? 'discover-filter active' : 'discover-filter'}
                  onClick={() => setDiscoverFilter(filter.key as 'all' | 'elite' | 'inner')}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="chat-search-results discover-results">
              {recipientSearchBusy && <div className="chat-search-card muted">Searching members...</div>}
              {!recipientSearchBusy && filteredDiscoverProfiles.length === 0 && (
                <div className="chat-empty-browser">
                  <strong>No members found</strong>
                  <p>Try another search or change the filter.</p>
                </div>
              )}
              {filteredDiscoverProfiles.map((profile) => {
                const existingConversation = summaryItems.find((conversation) => conversation.conversationKey === profile.username);
                return (
                  <button
                    key={profile.userId}
                    className={selectedConversation === profile.username ? 'chat-thread-row active' : 'chat-thread-row'}
                    onClick={() => onSelectThread(profile.username)}
                    type="button"
                  >
                    <div className="chat-thread-avatar">
                      {profile.avatarUrl ? (
                        <img alt={profile.displayName} className="feed-avatar-image" src={profile.avatarUrl} />
                      ) : (
                        profile.displayName.slice(0, 1).toUpperCase()
                      )}
                      {existingConversation && <i className="chat-thread-online-dot" />}
                    </div>
                    <div className="chat-thread-copy">
                      <div className="chat-thread-topline">
                        <strong>{profile.displayName}</strong>
                        <small>{profile.followersCount.toLocaleString()} followers</small>
                      </div>
                      <div className="chat-thread-subline">
                        <span className="chat-thread-type-pill">{profile.tier === 'Inner Circle' ? 'inner' : profile.tier === 'Elite' ? 'elite' : 'member'}</span>
                        <span>@{profile.username}</span>
                      </div>
                      <div className="chat-thread-preview">
                        {existingConversation ? `You already have a secure thread with ${profile.displayName}.` : `Tap to start a private conversation with ${profile.displayName}.`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {activeConversationKey && (
          <div className={privateChatActive ? 'chat-screen private-chat-screen' : 'chat-screen'}>
            <div className="chat-header">
              <div className="chat-header-left">
                {activeConversationKey && (
                  <button
                    className="chat-back-button"
                    onClick={(event) => {
                      event.preventDefault();
                      onClearSelectedThread();
                    }}
                    type="button"
                    aria-label="Back to inbox"
                  >
                    <ChevronLeftIcon />
                  </button>
                )}
                <div className="chat-avatar">{(activeConversationKey || 'K').slice(0, 1).toUpperCase()}</div>
                <div className="chat-user-info">
                  <strong>{activeConversationKey || 'Select a conversation'}</strong>
                  <small>
                    {!signalReady
                      ? 'Preparing secure session'
                      : activeConversationKey
                        ? activeConversationSummary?.lastMessageText
                          ? `last sync - ${formatRelativeTime(activeConversationSummary.lastMessageAt)}`
                          : 'online'
                        : 'Choose a conversation to start chatting'}
                  </small>
                </div>
              </div>

              <div className="chat-header-actions">
                <button
                  className="chat-icon-button"
                  disabled={!signalReady || !activeConversationKey || Boolean(callState)}
                  onClick={onStartAudioCall}
                  type="button"
                >
                  <PhoneIcon />
                </button>
                <button
                  className="chat-icon-button"
                  disabled={!signalReady || !activeConversationKey || Boolean(callState)}
                  onClick={onStartVideoCall}
                  type="button"
                >
                  <VideoIcon />
                </button>
              </div>
            </div>

            {error && <div className="chat-inline-notice error">{error}</div>}

            <div className="chat-messages">
              {!signalReady && <LoadingStateCard />}
              {signalReady && !activeConversationKey && <EmptyStateCard />}
              {signalReady &&
                activeConversationKey &&
                (conversationTimeline.length === 0 ? (
                  <div className="empty-thread-card">No messages in this conversation yet.</div>
                ) : (
                  conversationTimeline.map((entry) =>
                    entry.type === 'call' ? (
                      <article
                        key={entry.id}
                        className={entry.call.direction === 'outgoing' ? 'message-row outgoing call-entry' : 'message-row incoming call-entry'}
                      >
                        <div className={`call-timeline-card ${entry.call.outcome} ${entry.call.direction}`}>
                          <div className="call-timeline-copy">
                            <strong>{formatCallHeadline(entry.call)}</strong>
                            <p>{formatCallStatus(entry.call)}</p>
                          </div>
                          <small>{new Date(entry.call.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                      </article>
                    ) : (
                      <article
                        key={entry.id}
                        className={entry.message.direction === 'outgoing' ? 'message-row outgoing' : 'message-row incoming'}
                      >
                        {entry.message.kind === 'attachment' && entry.message.attachment ? (
                          <button className="message-bubble message-bubble-attachment" onClick={() => onOpenAttachment(entry.message)} type="button">
                            <div className="message-attachment-icon">
                              <AttachmentIcon />
                            </div>
                            <div className="message-attachment-copy">
                              <strong>{entry.message.attachment.fileName}</strong>
                              <span>{entry.message.attachment.mimeType}</span>
                              <small>{Math.max(1, Math.round(entry.message.attachment.byteSize / 1024))} KB</small>
                            </div>
                            <i className="message-attachment-cta">Open</i>
                          </button>
                        ) : (
                          <div className="message-bubble">{entry.message.text}</div>
                        )}
                        <div className="message-time">
                          {new Date(entry.message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </article>
                    )
                  )
                ))}
            </div>

            <form className="chat-input-wrap" onSubmit={onSendMessage}>
              {attachmentDraft && (
                <div className="chat-attachment-draft">
                  <div>
                    <strong>{attachmentDraft.name}</strong>
                    <small>{Math.max(1, Math.round(attachmentDraft.size / 1024))} KB ready</small>
                  </div>
                  <button className="chat-attach-send" disabled={busy} onClick={() => onSendAttachment()} type="button">
                    <SendIcon />
                  </button>
                </div>
              )}

              <div className="chat-input-bar">
                <label className="chat-input-tool">
                  <AttachmentIcon />
                  <input hidden type="file" onChange={onAttachmentSelected} />
                </label>
                <input
                  className="chat-input"
                  placeholder="Message..."
                  value={messageDraft}
                  onChange={(event) => onMessageDraftChange(event.target.value)}
                />
                <button className="chat-send" disabled={busy || !messageDraft.trim()} type="submit">
                  <SendIcon />
                </button>
              </div>
            </form>

            <AnimatePresence>
              {callState && (
                <CallOverlay
                  callState={callState}
                  localCallStream={localCallStream}
                  remoteCallStream={remoteCallStream}
                  onAccept={onAcceptCall}
                  onEnd={onEndCall}
                  onReject={onRejectCall}
                  onSilenceRingtone={onSilenceRingtone}
                  onToggleCallMute={onToggleCallMute}
                  onToggleCamera={onToggleCamera}
                  onToggleSpeakerMute={onToggleSpeakerMute}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {attachmentViewer && (
                <AttachmentPreviewOverlay
                  attachmentViewer={attachmentViewer}
                  onClose={onCloseAttachmentPreview}
                  onDownload={onDownloadAttachmentPreview}
                />
              )}
            </AnimatePresence>
          </div>
          )}
        </section>
      )}

      {tab === 'club' && (
        <section className="club-page">
          <section className="club-hero panel compact-panel">
            <div className="club-badge">
              <StarNavIcon />
              <span>Inner Circle</span>
            </div>
            <h1 className="premium-page-title">Exclusive moments</h1>
            <p className="premium-page-subtitle">Private content, elevated access, and premium signals for members who belong deeper inside KRYNO.</p>
          </section>

          <section className="club-status-card panel compact-panel">
            <div className="club-status-row">
              <div>
                <span className="premium-eyebrow">Your tier</span>
                <strong>{(socialMe?.followersCount ?? 0) > 50 ? 'Elite' : 'Basic'}</strong>
              </div>
              <div className="club-status-price">
                <strong>₹200/mo</strong>
                <small>active preview</small>
              </div>
            </div>
            <p>Use this space for premium/private-circle content, exclusive drops, and gated experiences as KRYNO grows.</p>
          </section>

          <section className="club-grid">
            {clubPosts.length === 0 && <div className="empty-thread-card">No club moments yet.</div>}
            {clubPosts.map((post) => {
              const locked = post.clubLocked && !unlockedClubPosts.includes(post.id);
              return (
                <article key={post.id} className="club-post-card">
                  <div className="club-post-media">
                    {post.mediaUrl ? (
                      post.mediaKind === 'video' ? (
                        <video className="club-post-media-asset" muted playsInline preload="metadata" src={post.mediaUrl} />
                      ) : (
                        <img alt={post.caption || post.author.displayName} className="club-post-media-asset" src={post.mediaUrl} />
                      )
                    ) : (
                      <div className="profile-post-fallback">
                        <span>{post.caption || 'Private moment'}</span>
                      </div>
                    )}

                    {locked && (
                      <div className="club-post-lock">
                        <div className="club-lock-orb">
                          <BookmarkIcon filled />
                        </div>
                        <strong>Inner Circle only</strong>
                        <button
                          className="primary-button"
                          onClick={() => setUnlockedClubPosts((current) => [...current, post.id])}
                          type="button"
                        >
                          Unlock preview
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="club-post-copy">
                    <strong>{post.caption || 'Private collection'}</strong>
                    <small>{formatRelativeTime(post.createdAt)} · {post.likeCount} likes · {post.commentCount} comments</small>
                  </div>
                </article>
              );
            })}
          </section>
        </section>
      )}

      {tab === 'profile' && (
        <section className="profile-page">
          <section className="profile-topbar">
            <button className="profile-topbar-button" onClick={openProfileEditor} type="button" aria-label="Settings">
              <SettingsIcon />
            </button>
            <div className="profile-topbar-brand">KRYNO</div>
            <button className="profile-topbar-button" type="button" aria-label="Share">
              <ShareOutlineIcon />
            </button>
          </section>

          <section className="panel compact-panel profile-hero-card">
            <div className="profile-hero-top">
              <span className="label-chip">Profile</span>
              <div className="profile-hero-actions">
                <button className="secondary-button profile-action-button" onClick={openProfileEditor} type="button">
                  Edit profile
                </button>
                <button className="secondary-button profile-action-button" onClick={openCreate} type="button">
                  Create
                </button>
              </div>
            </div>

            <div className="profile-hero-main">
              <div className="profile-avatar-hero" aria-label="Profile picture preview">
                {profileAvatarPreviewUrl ? (
                  <img alt={profileDisplayName} src={profileAvatarPreviewUrl} />
                ) : (
                  <span>{profileDisplayName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>

              <div className="profile-hero-copy">
                <div className="profile-name-block">
                  <h2>{profileDisplayName}</h2>
                  <p>@{profileHandle}</p>
                  <div className="profile-signal-line">
                    <span>{myStories.length} live stories</span>
                    <i />
                    <span>{mediaPostCount} media moments</span>
                  </div>
                </div>

                <div className="profile-stats-shell" aria-label="Profile stats">
                  <div className="profile-stat-card">
                    <strong>{myPosts.length}</strong>
                    <span>Posts</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat-card">
                    <strong>{socialMe?.followersCount ?? 0}</strong>
                    <span>Followers</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat-card">
                    <strong>{socialMe?.followingCount ?? 0}</strong>
                    <span>Following</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat-card">
                    <strong>{myStories.length}</strong>
                    <span>Stories</span>
                  </div>
                </div>

                <p className="profile-bio-copy">{profileBio}</p>

                <div className="profile-hero-cta-row">
                  <button className="secondary-button profile-action-button" onClick={openProfileEditor} type="button">
                    Edit profile
                  </button>
                  <button className="primary-button profile-action-button" onClick={openCreate} type="button">
                    New post
                  </button>
                  <button
                    className="secondary-button profile-action-button"
                    onClick={() => (myStory ? onOpenStory(myStory.id) : openCreate())}
                    type="button"
                  >
                    {myStory ? 'View story' : 'Add story'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="panel compact-panel profile-highlights-card">
            <div className="profile-section-header">
              <div>
                <span className="label-chip">Stories</span>
                <h4>Highlights</h4>
              </div>
              <small>{myStories.length} active</small>
            </div>

            <div className="profile-highlights-row">
              <button className="profile-highlight profile-highlight-add" onClick={openCreate} type="button">
                <span className="story-avatar-shell">
                  {profileAvatarPreviewUrl ? (
                    <img alt={profileDisplayName} className="story-avatar-image" src={profileAvatarPreviewUrl} />
                  ) : (
                    <span>{profileDisplayName.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
                <small>{myStory ? 'Your story' : 'Add story'}</small>
              </button>

              {myStories.map((story) => (
                <button key={story.id} className="profile-highlight" onClick={() => onOpenStory(story.id)} type="button">
                  <span className="story-avatar-shell">
                    {story.author.avatarUrl ? (
                      <img alt={story.author.displayName} className="story-avatar-image" src={story.author.avatarUrl} />
                    ) : (
                      <span>{story.author.displayName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <small>{story.caption?.trim() || 'Story'}</small>
                </button>
              ))}

              {myStories.length === 0 && (
                <div className="profile-highlights-empty">Stories you post will appear here for quick replay.</div>
              )}
            </div>
          </section>

          <section className="profile-body-grid">
            <div className="profile-main-column">
              <section className="panel compact-panel profile-posts-panel">
                <div className="profile-section-header">
                  <div>
                    <span className="label-chip">Posts</span>
                    <h4>Recent posts</h4>
                  </div>
                  <small className="profile-section-count">{myPosts.length} total</small>
                </div>

                {myPosts.length === 0 ? (
                  <div className="empty-thread-card">No posts yet. Create your first post to start your profile grid.</div>
                ) : (
                  <div className="profile-post-grid">
                    {myPosts.map((post) => (
                      <article key={post.id} className="profile-post-card">
                        <div className="profile-post-media">
                          {post.mediaUrl ? (
                            post.mediaKind === 'video' ? (
                              <video className="profile-post-media-asset" muted playsInline preload="metadata" src={post.mediaUrl} />
                            ) : (
                              <img alt={post.caption || profileDisplayName} className="profile-post-media-asset" src={post.mediaUrl} />
                            )
                          ) : (
                            <div className="profile-post-fallback">
                              <span>{post.caption || 'Text post'}</span>
                            </div>
                          )}

                          <div className="profile-post-overlay">
                            <div className="profile-post-overlay-stats">
                              <span>{post.likeCount} likes</span>
                              <span>{post.commentCount} comments</span>
                            </div>
                            <button className="profile-post-delete" onClick={() => onDeletePost(post)} type="button">
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="profile-post-copy">
                          <strong>{formatRelativeTime(post.createdAt)}</strong>
                          <p>{post.caption || 'Media post'}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="profile-side-column">
              <div ref={profileEditorRef}>
              <form className="panel compact-panel social-form-card profile-editor-card" onSubmit={onSaveProfile}>
                <div className="profile-section-header">
                  <div>
                    <span className="label-chip">Edit</span>
                    <h4>Profile details</h4>
                  </div>
                  <small>{session ? session.user.email : 'Signed out'}</small>
                </div>

                <div className="profile-avatar-editor">
                  <div className="profile-avatar-preview" aria-label="Profile picture preview">
                    {profileAvatarPreviewUrl ? (
                      <img alt={profileDisplayName} src={profileAvatarPreviewUrl} />
                    ) : (
                      <span>{profileDisplayName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="profile-avatar-copy">
                    <strong>Profile photo</strong>
                    <small>{profileForm.avatarFile ? 'New photo selected' : 'Use a clear, centered photo.'}</small>
                    {profileForm.avatarFile && <span className="profile-avatar-file">{profileForm.avatarFile.name}</span>}
                  </div>
                  <div className="profile-avatar-actions">
                    <label className="profile-avatar-button">
                      <span>{profileForm.avatarFile ? 'Change photo' : 'Choose photo'}</span>
                      <input hidden type="file" accept="image/*" onChange={onProfileAvatarSelected} />
                    </label>
                    {profileForm.avatarFile && (
                      <button
                        className="profile-avatar-button subtle"
                        type="button"
                        onClick={() => onProfileFormChange({ ...profileForm, avatarFile: null })}
                      >
                        Use current
                      </button>
                    )}
                  </div>
                </div>

                <input
                  placeholder="Display name"
                  value={profileForm.displayName}
                  onChange={(event) => onProfileFormChange({ ...profileForm, displayName: event.target.value })}
                />
                <textarea
                  placeholder="Add a short bio"
                  rows={4}
                  value={profileForm.bio}
                  onChange={(event) => onProfileFormChange({ ...profileForm, bio: event.target.value })}
                />
                <button className="primary-button" disabled={profileBusy} type="submit">
                  {profileBusy ? 'Saving...' : 'Save profile'}
                </button>
              </form>
              </div>

              <div className="profile-create-stack" ref={createSectionRef}>
                <form className="panel compact-panel social-form-card" onSubmit={onCreatePost}>
                  <div className="profile-section-header">
                    <div>
                      <span className="label-chip">Compose</span>
                      <h4>New post</h4>
                    </div>
                    <small>{postComposer.visibility === 'followers' ? 'Followers only' : 'Public'}</small>
                  </div>
                  <textarea
                    placeholder="Share something"
                    rows={4}
                    value={postComposer.caption}
                    onChange={(event) => onPostComposerChange({ ...postComposer, caption: event.target.value })}
                  />
                  <select
                    value={postComposer.visibility}
                    onChange={(event) =>
                      onPostComposerChange({ ...postComposer, visibility: event.target.value as 'public' | 'followers' })
                    }
                  >
                    <option value="public">Public</option>
                    <option value="followers">Followers</option>
                  </select>
                  <label className="upload-chip">
                    <AttachmentIcon />
                    <span>{postComposer.mediaFile ? postComposer.mediaFile.name : 'Add image or video'}</span>
                    <input hidden type="file" accept="image/*,video/*" onChange={onPostMediaSelected} />
                  </label>
                  <button className="primary-button" disabled={postBusy} type="submit">
                    {postBusy ? 'Publishing...' : 'Post'}
                  </button>
                </form>

                <form className="panel compact-panel social-form-card" onSubmit={onCreateStory}>
                  <div className="profile-section-header">
                    <div>
                      <span className="label-chip">Story</span>
                      <h4>Share a story</h4>
                    </div>
                    <small>{storyComposer.visibility === 'private_circle' ? 'Private circle' : storyComposer.visibility}</small>
                  </div>
                  <input
                    placeholder="Story caption"
                    value={storyComposer.caption}
                    onChange={(event) => onStoryComposerChange({ ...storyComposer, caption: event.target.value })}
                  />
                  <select
                    value={storyComposer.visibility}
                    onChange={(event) =>
                      onStoryComposerChange({
                        ...storyComposer,
                        visibility: event.target.value as 'public' | 'followers' | 'private_circle'
                      })
                    }
                  >
                    <option value="public">Public</option>
                    <option value="followers">Followers</option>
                    <option value="private_circle">Private circle</option>
                  </select>
                  <label className="upload-chip">
                    <AttachmentIcon />
                    <span>{storyComposer.mediaFile ? storyComposer.mediaFile.name : 'Add story media'}</span>
                    <input hidden type="file" accept="image/*,video/*" onChange={onStoryMediaSelected} />
                  </label>
                  <button className="secondary-button" disabled={storyBusy} type="submit">
                    {storyBusy ? 'Publishing...' : 'Story'}
                  </button>
                </form>
              </div>

              <section className="panel compact-panel profile-suggestions-card">
                <div className="profile-section-header">
                  <div>
                    <span className="label-chip">Discover</span>
                    <h4>People to follow</h4>
                  </div>
                  <small>{socialSuggestions.length} suggestions</small>
                </div>
                <div className="suggestion-list">
                  {socialSuggestions.length === 0 && <p>No suggestions yet.</p>}
                  {socialSuggestions.map((profile) => (
                    <div key={profile.userId} className="suggestion-item">
                      <div className="suggestion-item-copy">
                        <span className="feed-avatar suggestion-avatar">
                          {profile.avatarUrl ? (
                            <img alt={profile.displayName} className="feed-avatar-image" src={profile.avatarUrl} />
                          ) : (
                            profile.displayName.slice(0, 1)
                          )}
                        </span>
                        <div>
                          <strong>{profile.displayName}</strong>
                          <small>@{profile.username}</small>
                        </div>
                      </div>
                      <button
                        className="secondary-button"
                        disabled={followBusyUsers.includes(profile.username)}
                        onClick={() => onToggleFollow(profile)}
                        type="button"
                      >
                        {followBusyUsers.includes(profile.username)
                          ? profile.isFollowing
                            ? 'Updating...'
                            : 'Following...'
                          : profile.isFollowing
                            ? 'Following'
                            : 'Follow'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="profile-footer-actions">
                <button className="secondary-button" onClick={onRefresh} type="button">
                  Refresh profile
                </button>
                <button className="danger-button" onClick={onLogout} type="button">
                  Logout
                </button>
              </div>
            </aside>
          </section>
        </section>
      )}

      {!privateChatActive && (
        <nav className="kryno-bottom-dock" aria-label="Primary">
          <button className={`kryno-dock-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')} type="button">
            <HomeNavIcon />
            <span>Home</span>
          </button>
          <button className={`kryno-dock-item ${tab === 'discover' ? 'active' : ''}`} onClick={openSearch} type="button">
            <SearchNavIcon />
            <span>Discover</span>
          </button>
          <button className={`kryno-dock-item ${tab === 'club' ? 'active' : ''}`} onClick={() => setTab('club')} type="button">
            <StarNavIcon />
            <span>Club</span>
          </button>
          <button className={`kryno-dock-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')} type="button">
            <ProfileNavIcon />
            <span>Profile</span>
          </button>
        </nav>
      )}
    </section>
  );
}

function LoadingStateCard() {
  return (
    <div className="chat-empty-state">
      <strong>Preparing secure session...</strong>
      <p>Syncing your encrypted inbox and restoring recent threads.</p>
    </div>
  );
}

function EmptyStateCard() {
  return (
    <div className="chat-empty-state">
      <strong>Select a conversation</strong>
      <p>Pick a thread from your inbox or search for a verified user to start chatting.</p>
    </div>
  );
}

function formatCallStatus(entry: CallLogRecord) {
  if (entry.outcome === 'completed') {
    return entry.durationSeconds > 0 ? `${entry.durationSeconds}s connected` : 'Connected successfully';
  }

  if (entry.outcome === 'missed') {
    return entry.direction === 'incoming' ? 'You missed this call' : 'They did not answer';
  }

  if (entry.outcome === 'declined') {
    return entry.direction === 'incoming' ? 'You declined this call' : 'They declined your call';
  }

  if (entry.outcome === 'cancelled') {
    return 'Cancelled before connection';
  }

  if (entry.outcome === 'unavailable') {
    return 'Recipient unavailable';
  }

  return entry.statusText;
}

function formatCallHeadline(entry: CallLogRecord) {
  if (entry.direction === 'outgoing') {
    return `You called`;
  }

  return `Incoming ${entry.mode === 'video' ? 'video' : 'audio'} call from ${entry.remoteLabel}`;
}

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'now';
  }

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function AttachmentPreviewOverlay({
  attachmentViewer,
  onClose,
  onDownload
}: {
  attachmentViewer: NonNullable<AttachmentViewerShape>;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <motion.div className="attachment-preview-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className={`attachment-preview-sheet ${attachmentViewer.previewKind}`}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      >
        <div className="drawer-header">
          <div className="attachment-preview-header-copy">
            <span className="label-chip">Attachment</span>
            <h4>{attachmentViewer.fileName}</h4>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="attachment-preview-body">
          {attachmentViewer.previewKind === 'image' && (
            <img alt={attachmentViewer.fileName} className="attachment-preview-image" src={attachmentViewer.objectUrl} />
          )}
          {attachmentViewer.previewKind === 'pdf' && (
            <iframe className="attachment-preview-frame" src={attachmentViewer.objectUrl} title={attachmentViewer.fileName} />
          )}
          {attachmentViewer.previewKind === 'document' && (
            <div className="attachment-preview-placeholder">
              <strong>{attachmentViewer.fileName}</strong>
              <p>This file is decrypted and ready. Download it to open in the right app.</p>
            </div>
          )}
        </div>

        <div className="attachment-preview-meta">
          <span>{attachmentViewer.mimeType}</span>
          <span>{attachmentViewer.sizeLabel}</span>
        </div>

        <div className="attachment-preview-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Done
          </button>
          <button className="primary-button" onClick={onDownload} type="button">
            Download
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function CallOverlay({
  callState,
  localCallStream,
  remoteCallStream,
  onAccept,
  onEnd,
  onReject,
  onSilenceRingtone,
  onToggleCallMute,
  onToggleCamera,
  onToggleSpeakerMute
}: {
  callState: NonNullable<CallStateShape>;
  localCallStream: MediaStream | null;
  remoteCallStream: MediaStream | null;
  onAccept: () => void;
  onEnd: () => void;
  onReject: () => void;
  onSilenceRingtone: () => void;
  onToggleCallMute: () => void;
  onToggleCamera: () => void;
  onToggleSpeakerMute: () => void;
}) {
  const incoming = callState.direction === 'incoming' && callState.phase === 'ringing';
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const remoteHasVideo = Boolean(remoteCallStream?.getVideoTracks().some((track) => track.readyState === 'live'));
  const localHasVideo = Boolean(localCallStream?.getVideoTracks().some((track) => track.readyState === 'live'));

  useEffect(() => {
    if (!callState.connectedAt) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(callState.connectedAt!)) / 1000)));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [callState.connectedAt]);

  return (
    <motion.div className="call-overlay-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className={`call-overlay ${callState.mode === 'video' ? 'video' : 'audio'}`}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      >
        <div className="call-overlay-header">
          <div className="call-overlay-titleblock">
            <div className="call-overlay-topline">
              <span className="label-chip">{callState.mode === 'video' ? 'Video Call' : 'Audio Call'}</span>
              <span className={`call-status-chip ${callState.phase}`}>{formatCallPhase(callState.phase)}</span>
            </div>
            <strong>{callState.remoteLabel}</strong>
            <p>{callState.status}</p>
          </div>
          <span className="call-timer-chip">{formatElapsed(elapsedSeconds)}</span>
        </div>

        <div className="call-stage">
          <AudioSink muted={callState.speakerMuted} stream={remoteCallStream} />
          {callState.mode === 'video' ? (
            <div className="call-video-grid">
              <VideoTile
                label={`${callState.remoteLabel} live`}
                muted={callState.speakerMuted}
                placeholder={callState.phase === 'connected' ? 'Remote camera is off or still warming up' : 'Waiting for remote video'}
                stream={remoteCallStream}
                videoActive={remoteHasVideo}
              />
              <VideoTile label="You" muted={true} placeholder="Camera preview" stream={localCallStream} videoActive={localHasVideo} />
            </div>
          ) : (
            <div className="call-audio-stage">
              <div className="call-audio-orb">
                <span>{callState.remoteLabel.slice(0, 1).toUpperCase()}</span>
              </div>
              <div className="call-audio-pulse" />
              <p>{callState.phase === 'connected' ? 'Encrypted voice path established.' : 'Secure media channel is preparing.'}</p>
            </div>
          )}
        </div>

        <div className="call-meta-row">
          <span>{callState.muted ? 'Mic muted' : 'Mic live'}</span>
          <span>{callState.speakerMuted ? 'Speaker muted' : 'Speaker live'}</span>
          <span>{callState.mode === 'video' ? (callState.cameraEnabled ? 'Camera live' : 'Camera off') : 'Voice only'}</span>
        </div>

        <div className="call-controls">
          {incoming ? (
            <>
              <button className="call-control secondary" onClick={onSilenceRingtone} type="button">
                <BellOffIcon />
                Silence
              </button>
              <button className="call-control danger" onClick={onReject} type="button">
                <DeclineIcon />
                Decline
              </button>
              <button className="call-control success" onClick={onAccept} type="button">
                <PhoneIcon />
                Accept
              </button>
            </>
          ) : (
            <>
              <button className="call-control secondary" onClick={onToggleCallMute} type="button">
                <MicIcon muted={callState.muted} />
                {callState.muted ? 'Unmute' : 'Mute'}
              </button>
              <button className="call-control secondary" onClick={onToggleSpeakerMute} type="button">
                <SpeakerIcon muted={callState.speakerMuted} />
                {callState.speakerMuted ? 'Speaker off' : 'Speaker on'}
              </button>
              {callState.mode === 'video' && (
                <button className="call-control secondary" onClick={onToggleCamera} type="button">
                  <VideoIcon off={!callState.cameraEnabled} />
                  {callState.cameraEnabled ? 'Camera on' : 'Camera off'}
                </button>
              )}
              {callState.phase === 'ringing' && !callState.ringtoneSilenced && (
                <button className="call-control secondary" onClick={onSilenceRingtone} type="button">
                  <BellOffIcon />
                  Silence
                </button>
              )}
              <button className="call-control danger" onClick={callState.phase === 'ringing' ? onReject : onEnd} type="button">
                <DeclineIcon />
                {callState.phase === 'ringing' ? 'Cancel' : 'End'}
              </button>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

function VideoTile({
  label,
  muted,
  placeholder,
  stream,
  videoActive
}: {
  label: string;
  muted: boolean;
  placeholder: string;
  stream: MediaStream | null;
  videoActive: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-tile">
      {stream && videoActive ? <video ref={videoRef} autoPlay muted={muted} playsInline /> : <div className="video-placeholder">{placeholder}</div>}
      <span>{label}</span>
    </div>
  );
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatCallPhase(phase: NonNullable<CallStateShape>['phase']) {
  if (phase === 'connected') return 'Connected';
  if (phase === 'reconnecting') return 'Reconnecting';
  if (phase === 'connecting') return 'Connecting';
  return 'Ringing';
}

function AudioSink({ muted, stream }: { muted: boolean; stream: MediaStream | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.srcObject = stream;
  }, [stream]);

  return <audio ref={audioRef} autoPlay hidden muted={muted} playsInline />;
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m14.5 6.5-5 5 5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function HomeNavIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 10.2 12 5l6.5 5.2v7.3a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5v-7.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.5 19V13h5v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchNavIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15.6 15.6 3.9 3.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StarNavIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 4 2.3 4.8 5.2.7-3.8 3.7.9 5.2L12 15.9 7.4 18.4l.9-5.2-3.8-3.7 5.2-.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileNavIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6.5 18.5c1.2-2.4 3-3.6 5.5-3.6s4.3 1.2 5.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreateNavIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 6.5v11M6.5 12h11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Zm7 3.2-.9-.5a6.4 6.4 0 0 0-.4-1l.5-.9-1.6-1.6-.9.5c-.3-.2-.7-.3-1-.4l-.5-.9h-2.2l-.5.9c-.3.1-.7.2-1 .4l-.9-.5-1.6 1.6.5.9c-.2.3-.3.7-.4 1l-.9.5v2.2l.9.5c.1.3.2.7.4 1l-.5.9 1.6 1.6.9-.5c.3.2.7.3 1 .4l.5.9h2.2l.5-.9c.3-.1.7-.2 1-.4l.9.5 1.6-1.6-.5-.9c.2-.3.3-.7.4-1l.9-.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareOutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M16.5 8.2A2.7 2.7 0 1 0 13.8 5.5a2.7 2.7 0 0 0 2.7 2.7Zm-9 6.3A2.7 2.7 0 1 0 4.8 11.8a2.7 2.7 0 0 0 2.7 2.7Zm9 4A2.7 2.7 0 1 0 13.8 15.8a2.7 2.7 0 0 0 2.7 2.7ZM9.8 13l4.4 2.4M14.2 8.6 9.8 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.2 4.95 13.4a4.98 4.98 0 0 1 7.05-7.05L12 7.34l.01-.99a4.98 4.98 0 1 1 7.04 7.05L12 20.2Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 17.5 3.5 20V7.5A3.5 3.5 0 0 1 7 4h10A3.5 3.5 0 0 1 20.5 7.5v6A3.5 3.5 0 0 1 17 17H6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 21 8.5 12 14 3 8.5 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 15.5 12 21l9-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 4.5h10v15l-5-3.5-5 3.5v-15Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 12.5 14 7a3 3 0 1 1 4.2 4.2l-7.6 7.6A4.5 4.5 0 1 1 4.2 12l7.2-7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19 20 12 4 5l2.8 5.4L14 12l-7.2 1.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.7 4.9h3l1.1 3.7-1.8 1.8a14.4 14.4 0 0 0 4.6 4.6l1.8-1.8 3.7 1.1v3a1.7 1.7 0 0 1-1.9 1.7A15.9 15.9 0 0 1 5 6.8a1.7 1.7 0 0 1 1.7-1.9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h7a2.5 2.5 0 0 1 2.5 2.5V8l3.5-2v10l-3.5-2v.5A2.5 2.5 0 0 1 14 17H7a2.5 2.5 0 0 1-2.5-2.5v-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {off && <path d="M4 4 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function MicIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 11.5v.5a5.5 5.5 0 0 0 11 0v-.5M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {muted && <path d="M5 5 19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function SpeakerIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 10h3l4-4v12l-4-4H5v-4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {!muted && (
        <>
          <path d="M16 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {muted && <path d="M15 9l4 4M19 9l-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 9a4.5 4.5 0 0 1 9 0v4l1.5 2H6l1.5-2V9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 18a2 2 0 0 0 4 0M4 4l16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function KrynoNotificationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 9.25a4.5 4.5 0 0 1 9 0v3.75l1.55 2.15H5.95L7.5 13V9.25Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10.1 18a1.95 1.95 0 0 0 3.8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m17.85 5.1.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7.7-1.3Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeclineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16.5c3.8-3.4 8.2-3.4 12 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 14.5 6 16.5l2 2M16 14.5l2 2-2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
