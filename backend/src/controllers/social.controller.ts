import { FastifyReply, FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { socialService } from '../services/social.service.js';

const mediaUploadSchema = z.object({
  kind: z.enum(['avatar', 'post', 'story']),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  bytesBase64: z.string().min(1)
});

const mediaUploadFieldsSchema = mediaUploadSchema.omit({ bytesBase64: true });

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(280).optional(),
  avatarMediaId: z.uuid().nullable().optional()
});

const usernameParamsSchema = z.object({
  username: z.string().trim().min(3).max(32)
});

const createPostSchema = z.object({
  caption: z.string().max(500).default(''),
  visibility: z.enum(['public', 'followers']).default('public'),
  mediaAssetId: z.uuid().nullable().optional()
});

const setLikeParamsSchema = z.object({
  postId: z.uuid()
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(280)
});

const createStorySchema = z.object({
  caption: z.string().max(280).default(''),
  visibility: z.enum(['public', 'followers', 'private_circle']).default('public'),
  mediaAssetId: z.uuid()
});

const storyParamsSchema = z.object({
  storyId: z.uuid()
});

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional()
});

type MediaUploadFieldMap = Record<string, string | MultipartFile | undefined>;

function getFieldString(fields: MediaUploadFieldMap, key: string) {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
}

function parseBase64(value: string) {
  try {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.byteLength === 0) {
      throw new Error('empty');
    }
    return bytes;
  } catch {
    throw new AppError(400, 'Media payload must be valid base64.', 'INVALID_MEDIA_PAYLOAD');
  }
}

export async function socialBootstrapController(request: FastifyRequest, reply: FastifyReply) {
  const result = await socialService.getBootstrap(request.auth.userId);
  return reply.code(200).send(result);
}

export async function uploadMediaController(request: FastifyRequest, reply: FastifyReply) {
  if (request.isMultipart()) {
    const values: MediaUploadFieldMap = {};

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        values[part.fieldname] = part;
      } else {
        values[part.fieldname] = String(part.value ?? '');
      }
    }

    const media = values.media ?? values.file ?? values.blob;

    if (!media || typeof media === 'string') {
      throw new AppError(400, 'Media file is required.', 'MISSING_SOCIAL_MEDIA_FILE');
    }

    const fields = mediaUploadFieldsSchema.parse({
      kind: getFieldString(values, 'kind'),
      fileName: getFieldString(values, 'fileName') ?? media.filename,
      mimeType: getFieldString(values, 'mimeType') ?? media.mimetype
    });
    const bytes = await media.toBuffer();

    if (bytes.byteLength === 0) {
      throw new AppError(400, 'Media file is empty.', 'EMPTY_SOCIAL_MEDIA_FILE');
    }

    const result = await socialService.uploadMedia({
      userId: request.auth.userId,
      kind: fields.kind,
      fileName: fields.fileName,
      mimeType: fields.mimeType,
      bytes
    });
    return reply.code(201).send(result);
  }

  const body = mediaUploadSchema.parse(request.body ?? {});
  const result = await socialService.uploadMedia({
    userId: request.auth.userId,
    kind: body.kind,
    fileName: body.fileName,
    mimeType: body.mimeType,
    bytes: parseBase64(body.bytesBase64)
  });
  return reply.code(201).send(result);
}

export async function getMyProfileController(request: FastifyRequest, reply: FastifyReply) {
  const result = await socialService.getMyProfile(request.auth.userId);
  return reply.code(200).send(result);
}

export async function updateMyProfileController(request: FastifyRequest, reply: FastifyReply) {
  const body = updateProfileSchema.parse(request.body ?? {});
  const result = await socialService.updateMyProfile(request.auth.userId, body);
  return reply.code(200).send(result);
}

export async function getProfileController(request: FastifyRequest, reply: FastifyReply) {
  const params = usernameParamsSchema.parse(request.params);
  const result = await socialService.getProfile(request.auth.userId, params.username);
  return reply.code(200).send(result);
}

export async function followUserController(request: FastifyRequest, reply: FastifyReply) {
  const params = usernameParamsSchema.parse(request.params);
  const result = await socialService.followUser(request.auth.userId, params.username);
  return reply.code(200).send(result);
}

export async function unfollowUserController(request: FastifyRequest, reply: FastifyReply) {
  const params = usernameParamsSchema.parse(request.params);
  const result = await socialService.unfollowUser(request.auth.userId, params.username);
  return reply.code(200).send(result);
}

export async function createPostController(request: FastifyRequest, reply: FastifyReply) {
  const body = createPostSchema.parse(request.body ?? {});
  const result = await socialService.createPost({
    userId: request.auth.userId,
    caption: body.caption,
    visibility: body.visibility,
    mediaAssetId: body.mediaAssetId
  });
  return reply.code(201).send(result);
}

export async function deletePostController(request: FastifyRequest, reply: FastifyReply) {
  const params = setLikeParamsSchema.parse(request.params);
  const result = await socialService.deletePost(request.auth.userId, params.postId);
  return reply.code(200).send(result);
}

export async function listFeedController(request: FastifyRequest, reply: FastifyReply) {
  const query = feedQuerySchema.parse(request.query ?? {});
  const result = await socialService.listFeed(request.auth.userId, query.limit ?? 20);
  return reply.code(200).send({ feed: result });
}

export async function likePostController(request: FastifyRequest, reply: FastifyReply) {
  const params = setLikeParamsSchema.parse(request.params);
  const result = await socialService.setPostLiked(request.auth.userId, params.postId, true);
  return reply.code(200).send(result);
}

export async function unlikePostController(request: FastifyRequest, reply: FastifyReply) {
  const params = setLikeParamsSchema.parse(request.params);
  const result = await socialService.setPostLiked(request.auth.userId, params.postId, false);
  return reply.code(200).send(result);
}

export async function commentPostController(request: FastifyRequest, reply: FastifyReply) {
  const params = setLikeParamsSchema.parse(request.params);
  const body = createCommentSchema.parse(request.body ?? {});
  const result = await socialService.addPostComment(request.auth.userId, params.postId, body.body);
  return reply.code(201).send(result);
}

export async function createStoryController(request: FastifyRequest, reply: FastifyReply) {
  const body = createStorySchema.parse(request.body ?? {});
  const result = await socialService.createStory({
    userId: request.auth.userId,
    caption: body.caption,
    visibility: body.visibility,
    mediaAssetId: body.mediaAssetId
  });
  return reply.code(201).send(result);
}

export async function listStoriesController(request: FastifyRequest, reply: FastifyReply) {
  const query = feedQuerySchema.parse(request.query ?? {});
  const result = await socialService.listStories(request.auth.userId, query.limit ?? 20);
  return reply.code(200).send({ stories: result });
}

export async function viewStoryController(request: FastifyRequest, reply: FastifyReply) {
  const params = storyParamsSchema.parse(request.params);
  const result = await socialService.markStoryViewed(request.auth.userId, params.storyId);
  return reply.code(200).send(result);
}
