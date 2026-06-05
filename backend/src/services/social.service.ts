import { randomUUID } from 'crypto';
import type pg from 'pg';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { assertTrustedMediaPayload, getCanonicalMediaExtension } from '../utils/media.js';
import { socialMediaStorage } from './object-storage.service.js';

type MediaKind = 'avatar' | 'post' | 'story';
type Visibility = 'public' | 'followers' | 'private_circle';

type UploadMediaInput = {
  userId: string;
  kind: MediaKind;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

type UpdateProfileInput = {
  displayName?: string;
  bio?: string;
  avatarMediaId?: string | null;
  profileVisibility?: 'public' | 'followers';
  postsVisibility?: 'public' | 'followers';
  messageVisibility?: 'public' | 'followers' | 'none';
};

type CreatePostInput = {
  userId: string;
  caption: string;
  visibility: Extract<Visibility, 'public' | 'followers'>;
  mediaAssetId?: string | null;
};

type CreateStoryInput = {
  userId: string;
  caption: string;
  visibility: Visibility;
  mediaAssetId: string;
};

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

type ProfileRow = {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  profile_visibility: string;
  posts_visibility: string;
  message_visibility: string;
  followers_count: number;
  following_count: number;
  is_following: boolean;
};

type FeedRow = {
  id: string;
  caption: string;
  visibility: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

type StoryRow = {
  id: string;
  caption: string;
  visibility: string;
  created_at: string;
  expires_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  media_url: string;
  media_mime_type: string;
  viewed_by_me: boolean;
  view_count: number;
};

type QueryRunner = typeof pool | pg.PoolClient;

function sanitizePublicText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, '').trim().slice(0, maxLength);
}

function normalizeVisibility(value: string): Visibility {
  if (value === 'public' || value === 'followers' || value === 'private_circle') {
    return value;
  }

  throw new AppError(400, 'Unsupported visibility option.', 'INVALID_VISIBILITY');
}

function inferPostMediaKind(mimeType: string | null) {
  if (!mimeType) return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'text';
}

function mapProfile(row: ProfileRow) {
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    profileVisibility: row.profile_visibility,
    postsVisibility: row.posts_visibility,
    messageVisibility: row.message_visibility,
    privacy: {
      viewProfile: row.profile_visibility === 'public',
      viewPosts: row.posts_visibility === 'public',
      message: row.message_visibility === 'public'
    },
    followersCount: Number(row.followers_count ?? 0),
    followingCount: Number(row.following_count ?? 0),
    isFollowing: Boolean(row.is_following)
  };
}

export class SocialService {
  private async ensureProfileRow(userId: string, username: string) {
    await pool.query(
      `
        insert into user_profiles (user_id, display_name)
        values ($1, $2)
        on conflict (user_id) do nothing
      `,
      [userId, username]
    );
  }

  private async fetchProfile(viewerUserId: string, targetUserId: string, queryRunner: QueryRunner = pool) {
    const result = await queryRunner.query<ProfileRow>(
      `
        select
          u.id as user_id,
          u.username,
          u.email,
          coalesce(up.display_name, u.username) as display_name,
          coalesce(up.bio, '') as bio,
          avatar.public_url as avatar_url,
          coalesce(up.profile_visibility, 'public') as profile_visibility,
          coalesce(up.posts_visibility, 'public') as posts_visibility,
          coalesce(up.message_visibility, 'public') as message_visibility,
          (
            select count(*)::int
            from follows f
            where f.followee_user_id = u.id
          ) as followers_count,
          (
            select count(*)::int
            from follows f
            where f.follower_user_id = u.id
          ) as following_count,
          exists(
            select 1
            from follows f
            where f.follower_user_id = $1
              and f.followee_user_id = u.id
          ) as is_following
        from users u
        left join user_profiles up on up.user_id = u.id
        left join media_assets avatar on avatar.id = up.avatar_media_id
        where u.id = $2
          and u.email_verified_at is not null
          and (
            u.id = $1
            or coalesce(up.profile_visibility, 'public') = 'public'
            or (
              coalesce(up.profile_visibility, 'public') = 'followers'
              and exists(
                select 1
                from follows f
                where f.follower_user_id = $1
                  and f.followee_user_id = u.id
              )
            )
          )
        limit 1
      `,
      [viewerUserId, targetUserId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, 'User profile not found.', 'PROFILE_NOT_FOUND');
    }

    return mapProfile(row);
  }

  private async fetchPosts(viewerUserId: string, postIds?: string[], limit = 20) {
    const whereClause = postIds?.length
      ? `
          p.id = any($2::uuid[])
          and (
            p.visibility = 'public'
            or p.author_user_id = $1
            or (
              p.visibility = 'followers'
              and exists(
                select 1
                from follows f
                where f.follower_user_id = $1
                  and f.followee_user_id = p.author_user_id
              )
            )
          )
          and (
            p.author_user_id = $1
            or coalesce(up.posts_visibility, 'public') = 'public'
            or (
              coalesce(up.posts_visibility, 'public') = 'followers'
              and exists(
                select 1
                from follows f
                where f.follower_user_id = $1
                  and f.followee_user_id = p.author_user_id
              )
            )
          )
        `
      : `
          (
            p.visibility = 'public'
            or p.author_user_id = $1
            or (
              p.visibility = 'followers'
              and exists(
                select 1
                from follows f
                where f.follower_user_id = $1
                  and f.followee_user_id = p.author_user_id
              )
            )
          )
          and (
            p.author_user_id = $1
            or coalesce(up.posts_visibility, 'public') = 'public'
            or (
              coalesce(up.posts_visibility, 'public') = 'followers'
              and exists(
                select 1
                from follows f
                where f.follower_user_id = $1
                  and f.followee_user_id = p.author_user_id
              )
            )
          )
        `;

    const params = postIds?.length ? [viewerUserId, postIds] : [viewerUserId, limit];
    const sql = postIds?.length
      ? `
          select
            p.id,
            p.caption,
            p.visibility,
            p.created_at,
            u.username,
            coalesce(up.display_name, u.username) as display_name,
            avatar.public_url as avatar_url,
            media.public_url as media_url,
            media.mime_type as media_mime_type,
            (
              select count(*)::int
              from post_likes pl
              where pl.post_id = p.id
            ) as like_count,
            (
              select count(*)::int
              from post_comments pc
              where pc.post_id = p.id
            ) as comment_count,
            exists(
              select 1
              from post_likes pl
              where pl.post_id = p.id
                and pl.user_id = $1
            ) as liked_by_me
          from posts p
          join users u on u.id = p.author_user_id
          left join user_profiles up on up.user_id = u.id
          left join media_assets avatar on avatar.id = up.avatar_media_id
          left join media_assets media on media.id = p.media_asset_id
          where ${whereClause}
          order by p.created_at desc
        `
      : `
          select
            p.id,
            p.caption,
            p.visibility,
            p.created_at,
            u.username,
            coalesce(up.display_name, u.username) as display_name,
            avatar.public_url as avatar_url,
            media.public_url as media_url,
            media.mime_type as media_mime_type,
            (
              select count(*)::int
              from post_likes pl
              where pl.post_id = p.id
            ) as like_count,
            (
              select count(*)::int
              from post_comments pc
              where pc.post_id = p.id
            ) as comment_count,
            exists(
              select 1
              from post_likes pl
              where pl.post_id = p.id
                and pl.user_id = $1
            ) as liked_by_me
          from posts p
          join users u on u.id = p.author_user_id
          left join user_profiles up on up.user_id = u.id
          left join media_assets avatar on avatar.id = up.avatar_media_id
          left join media_assets media on media.id = p.media_asset_id
          where ${whereClause}
          order by p.created_at desc
          limit $2
        `;

    const postsResult = await pool.query<FeedRow>(sql, params);
    const posts = postsResult.rows;
    if (posts.length === 0) {
      return [];
    }

    const commentResult = await pool.query<{
      id: string;
      post_id: string;
      body: string;
      created_at: string;
      username: string;
      display_name: string;
    }>(
      `
        select
          c.id,
          c.post_id,
          c.body,
          c.created_at,
          u.username,
          coalesce(up.display_name, u.username) as display_name
        from post_comments c
        join users u on u.id = c.author_user_id
        left join user_profiles up on up.user_id = u.id
        where c.post_id = any($1::uuid[])
        order by c.created_at desc
      `,
      [posts.map((post) => post.id)]
    );

    const commentsByPost = new Map<string, Array<{ id: string; body: string; createdAt: string; username: string; displayName: string }>>();
    for (const row of commentResult.rows) {
      const existing = commentsByPost.get(row.post_id) ?? [];
      if (existing.length < 4) {
        existing.push({
          id: row.id,
          body: row.body,
          createdAt: row.created_at,
          username: row.username,
          displayName: row.display_name
        });
      }
      commentsByPost.set(row.post_id, existing);
    }

    return posts.map((row) => ({
      id: row.id,
      caption: row.caption,
      visibility: row.visibility,
      createdAt: row.created_at,
      author: {
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url
      },
      mediaUrl: row.media_url,
      mediaMimeType: row.media_mime_type,
      mediaKind: inferPostMediaKind(row.media_mime_type),
      likeCount: Number(row.like_count ?? 0),
      commentCount: Number(row.comment_count ?? 0),
      likedByMe: Boolean(row.liked_by_me),
      comments: (commentsByPost.get(row.id) ?? []).reverse()
    }));
  }

  private async fetchStories(viewerUserId: string, limit = 20) {
    const result = await pool.query<StoryRow>(
      `
        select
          s.id,
          s.caption,
          s.visibility,
          s.created_at,
          s.expires_at,
          u.username,
          coalesce(up.display_name, u.username) as display_name,
          avatar.public_url as avatar_url,
          media.public_url as media_url,
          media.mime_type as media_mime_type,
          exists(
            select 1
            from story_views sv
            where sv.story_id = s.id
              and sv.viewer_user_id = $1
          ) as viewed_by_me,
          (
            select count(*)::int
            from story_views sv
            where sv.story_id = s.id
          ) as view_count
        from stories s
        join users u on u.id = s.author_user_id
        left join user_profiles up on up.user_id = u.id
        left join media_assets avatar on avatar.id = up.avatar_media_id
        join media_assets media on media.id = s.media_asset_id
        where s.expires_at > now()
          and (
            s.author_user_id = $1
            or s.visibility = 'public'
            or (
              s.visibility = 'followers'
              and exists(
                select 1
                from follows f
                where f.follower_user_id = $1
                  and f.followee_user_id = s.author_user_id
              )
            )
          )
        order by s.created_at desc
        limit $2
      `,
      [viewerUserId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      caption: row.caption,
      visibility: row.visibility,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      author: {
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url
      },
      mediaUrl: row.media_url,
      mediaMimeType: row.media_mime_type,
      viewedByMe: Boolean(row.viewed_by_me),
      viewCount: Number(row.view_count ?? 0)
    }));
  }

  private async getUserIdByUsername(username: string) {
    const result = await pool.query<{ id: string }>(
      `
        select id
        from users
        where lower(username) = lower($1)
          and email_verified_at is not null
        limit 1
      `,
      [username]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    }

    return row.id;
  }

  async getBootstrap(userId: string) {
    const me = await this.fetchProfile(userId, userId);
    const [feed, stories, suggestionsResult] = await Promise.all([
      this.fetchPosts(userId, undefined, 20),
      this.fetchStories(userId, 12),
      pool.query<ProfileRow>(
        `
          select
            u.id as user_id,
            u.username,
            u.email,
            coalesce(up.display_name, u.username) as display_name,
            coalesce(up.bio, '') as bio,
            avatar.public_url as avatar_url,
            (
              select count(*)::int
              from follows f
              where f.followee_user_id = u.id
            ) as followers_count,
            (
              select count(*)::int
              from follows f
              where f.follower_user_id = u.id
            ) as following_count,
            false as is_following
          from users u
          left join user_profiles up on up.user_id = u.id
          left join media_assets avatar on avatar.id = up.avatar_media_id
          where u.id <> $1
            and u.email_verified_at is not null
            and not exists(
              select 1
              from follows f
              where f.follower_user_id = $1
                and f.followee_user_id = u.id
            )
          order by followers_count desc, u.created_at desc
          limit 5
        `,
        [userId]
      )
    ]);

    return {
      me,
      feed,
      stories,
      suggestions: suggestionsResult.rows.map((row) => mapProfile(row))
    };
  }

  async uploadMedia(input: UploadMediaInput) {
    if (input.bytes.byteLength > env.MAX_SOCIAL_MEDIA_BYTES) {
      throw new AppError(413, 'Media file exceeds the maximum allowed size.', 'MEDIA_TOO_LARGE');
    }

    const trustedMimeType = assertTrustedMediaPayload(input.mimeType, input.bytes);

    if (!ALLOWED_IMAGE_MIME_TYPES.has(trustedMimeType) && !ALLOWED_VIDEO_MIME_TYPES.has(trustedMimeType)) {
      throw new AppError(400, 'Unsupported media type. Use JPG, PNG, WEBP, GIF, MP4, MOV, or WEBM.', 'INVALID_MEDIA_TYPE');
    }

    if (input.kind === 'avatar' && !ALLOWED_IMAGE_MIME_TYPES.has(trustedMimeType)) {
      throw new AppError(400, 'Profile photos must be images.', 'INVALID_AVATAR_MEDIA_TYPE');
    }

    const assetId = randomUUID();
    const extension = getCanonicalMediaExtension(trustedMimeType);
    const storageKey = `${assetId}${extension}`;
    const publicUrl = socialMediaStorage.getPublicUrl?.(storageKey) ?? `/media/${storageKey}`;

    await socialMediaStorage.putObject({
      key: storageKey,
      bytes: input.bytes,
      contentType: trustedMimeType,
      cacheControl: input.kind === 'avatar' ? 'public, max-age=3600' : 'public, max-age=31536000, immutable'
    });

    await pool.query(
      `
        insert into media_assets (
          id,
          owner_user_id,
          kind,
          storage_key,
          public_url,
          mime_type,
          byte_size
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [assetId, input.userId, input.kind, storageKey, publicUrl, trustedMimeType, input.bytes.byteLength]
    );

    return {
      assetId,
      url: publicUrl,
      mimeType: trustedMimeType,
      byteSize: input.bytes.byteLength
    };
  }

  async getMyProfile(userId: string) {
    return this.fetchProfile(userId, userId);
  }

  async getProfile(viewerUserId: string, username: string) {
    const targetUserId = await this.getUserIdByUsername(username);
    return this.fetchProfile(viewerUserId, targetUserId);
  }

  async updateMyProfile(userId: string, input: UpdateProfileInput) {
    const nextDisplayName = input.displayName !== undefined ? sanitizePublicText(input.displayName, 80) : undefined;
    const nextBio = input.bio !== undefined ? sanitizePublicText(input.bio, 280) : undefined;

    return withTransaction(async (client) => {
      const userResult = await client.query<{ username: string }>('select username from users where id = $1 limit 1', [userId]);
      const user = userResult.rows[0];
      if (!user) {
        throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
      }

      await client.query(
        `
          insert into user_profiles (user_id, display_name)
          values ($1, $2)
          on conflict (user_id) do nothing
        `,
        [userId, user.username]
      );

      if (input.avatarMediaId) {
        const avatarResult = await client.query<{ id: string }>(
          `
            select id
            from media_assets
            where id = $1
              and owner_user_id = $2
              and kind = 'avatar'
            limit 1
          `,
          [input.avatarMediaId, userId]
        );

        if (!avatarResult.rows[0]) {
          throw new AppError(400, 'Avatar asset is invalid.', 'INVALID_AVATAR_ASSET');
        }
      }

      await client.query(
        `
          update user_profiles
          set
            display_name = coalesce($2, display_name),
            bio = coalesce($3, bio),
            avatar_media_id = case
              when $4::uuid is null then avatar_media_id
              else $4::uuid
            end,
            profile_visibility = coalesce($5, profile_visibility),
            posts_visibility = coalesce($6, posts_visibility),
            message_visibility = coalesce($7, message_visibility),
            updated_at = now()
          where user_id = $1
        `,
        [
          userId,
          nextDisplayName ?? null,
          nextBio ?? null,
          input.avatarMediaId ?? null,
          input.profileVisibility ?? null,
          input.postsVisibility ?? null,
          input.messageVisibility ?? null
        ]
      );

      return this.fetchProfile(userId, userId, client);
    });
  }

  async followUser(currentUserId: string, username: string) {
    const targetUserId = await this.getUserIdByUsername(username);
    if (targetUserId === currentUserId) {
      throw new AppError(400, 'You cannot follow yourself.', 'INVALID_FOLLOW_TARGET');
    }

    await pool.query(
      `
        insert into follows (follower_user_id, followee_user_id)
        values ($1, $2)
        on conflict do nothing
      `,
      [currentUserId, targetUserId]
    );

    return this.fetchProfile(currentUserId, targetUserId);
  }

  async unfollowUser(currentUserId: string, username: string) {
    const targetUserId = await this.getUserIdByUsername(username);
    await pool.query(
      `
        delete from follows
        where follower_user_id = $1
          and followee_user_id = $2
      `,
      [currentUserId, targetUserId]
    );

    return this.fetchProfile(currentUserId, targetUserId);
  }

  async createPost(input: CreatePostInput) {
    const caption = sanitizePublicText(input.caption, 500);
    if (!caption && !input.mediaAssetId) {
      throw new AppError(400, 'A post needs text or media.', 'EMPTY_POST');
    }

    const mediaAsset =
      input.mediaAssetId
        ? await pool.query<{ mime_type: string }>(
            `
              select mime_type
              from media_assets
              where id = $1
                and owner_user_id = $2
                and kind = 'post'
              limit 1
            `,
            [input.mediaAssetId, input.userId]
          )
        : null;

    if (input.mediaAssetId && !mediaAsset?.rows[0]) {
      throw new AppError(400, 'Post media asset is invalid.', 'INVALID_POST_ASSET');
    }

    const insertResult = await pool.query<{ id: string }>(
      `
        insert into posts (
          author_user_id,
          media_asset_id,
          media_kind,
          caption,
          visibility
        )
        values ($1, $2, $3, $4, $5)
        returning id
      `,
      [
        input.userId,
        input.mediaAssetId ?? null,
        inferPostMediaKind(mediaAsset?.rows[0]?.mime_type ?? null),
        caption,
        normalizeVisibility(input.visibility)
      ]
    );

    const [post] = await this.fetchPosts(input.userId, [insertResult.rows[0].id]);
    return post;
  }

  async deletePost(userId: string, postId: string) {
    await withTransaction(async (client) => {
      const postResult = await client.query<{ media_asset_id: string | null }>(
        `
          select media_asset_id
          from posts
          where id = $1
            and author_user_id = $2
          limit 1
          for update
        `,
        [postId, userId]
      );

      const post = postResult.rows[0];
      if (!post) {
        throw new AppError(404, 'Post not found or not owned by this user.', 'POST_NOT_FOUND');
      }

      await client.query('delete from posts where id = $1 and author_user_id = $2', [postId, userId]);

      if (post.media_asset_id) {
        const mediaResult = await client.query<{ storage_key: string }>(
          `
            delete from media_assets
            where id = $1
              and owner_user_id = $2
              and kind = 'post'
            returning storage_key
          `,
          [post.media_asset_id, userId]
        );

        const storageKey = mediaResult.rows[0]?.storage_key;
        if (storageKey) {
          await socialMediaStorage.deleteObject(storageKey);
        }
      }
    });

    return { success: true, postId };
  }

  async listFeed(userId: string, limit = 20) {
    return this.fetchPosts(userId, undefined, limit);
  }

  async setPostLiked(userId: string, postId: string, liked: boolean) {
    if (liked) {
      await pool.query(
        `
          insert into post_likes (post_id, user_id)
          values ($1, $2)
          on conflict do nothing
        `,
        [postId, userId]
      );
    } else {
      await pool.query(
        `
          delete from post_likes
          where post_id = $1
            and user_id = $2
        `,
        [postId, userId]
      );
    }

    const [post] = await this.fetchPosts(userId, [postId]);
    if (!post) {
      throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
    }

    return post;
  }

  async addPostComment(userId: string, postId: string, body: string) {
    const trimmed = sanitizePublicText(body, 280);
    if (!trimmed) {
      throw new AppError(400, 'Comment cannot be empty.', 'EMPTY_COMMENT');
    }

    await pool.query(
      `
        insert into post_comments (post_id, author_user_id, body)
        values ($1, $2, $3)
      `,
      [postId, userId, trimmed]
    );

    const [post] = await this.fetchPosts(userId, [postId]);
    if (!post) {
      throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
    }

    return post;
  }

  async createStory(input: CreateStoryInput) {
    const caption = sanitizePublicText(input.caption, 280);
    const assetResult = await pool.query<{ id: string }>(
      `
        select id
        from media_assets
        where id = $1
          and owner_user_id = $2
          and kind = 'story'
        limit 1
      `,
      [input.mediaAssetId, input.userId]
    );

    if (!assetResult.rows[0]) {
      throw new AppError(400, 'Story media asset is invalid.', 'INVALID_STORY_ASSET');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      `
        insert into stories (
          author_user_id,
          media_asset_id,
          caption,
          visibility,
          expires_at
        )
        values ($1, $2, $3, $4, $5)
      `,
      [input.userId, input.mediaAssetId, caption, normalizeVisibility(input.visibility), expiresAt.toISOString()]
    );

    const stories = await this.fetchStories(input.userId, 12);
    return stories[0];
  }

  async listStories(userId: string, limit = 20) {
    return this.fetchStories(userId, limit);
  }

  async markStoryViewed(userId: string, storyId: string) {
    await pool.query(
      `
        insert into story_views (story_id, viewer_user_id)
        values ($1, $2)
        on conflict do nothing
      `,
      [storyId, userId]
    );

    const stories = await this.fetchStories(userId, 20);
    return stories.find((story) => story.id === storyId) ?? null;
  }
}

export const socialService = new SocialService();
