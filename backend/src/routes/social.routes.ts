import { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  commentPostController,
  createPostController,
  createStoryController,
  deletePostController,
  followUserController,
  getMyProfileController,
  getProfileController,
  likePostController,
  listFeedController,
  listStoriesController,
  socialBootstrapController,
  unfollowUserController,
  unlikePostController,
  updateMyProfileController,
  uploadMediaController,
  viewStoryController
} from '../controllers/social.controller.js';

export async function socialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/bootstrap', socialBootstrapController);
  app.post('/media', uploadMediaController);

  app.get('/profile/me', getMyProfileController);
  app.put('/profile/me', updateMyProfileController);
  app.get('/profile/:username', getProfileController);

  app.post('/follow/:username', followUserController);
  app.delete('/follow/:username', unfollowUserController);

  app.get('/feed', listFeedController);
  app.post('/posts', createPostController);
  app.delete('/posts/:postId', deletePostController);
  app.post('/posts/:postId/like', likePostController);
  app.delete('/posts/:postId/like', unlikePostController);
  app.post('/posts/:postId/comments', commentPostController);

  app.get('/stories', listStoriesController);
  app.post('/stories', createStoryController);
  app.post('/stories/:storyId/view', viewStoryController);
}
