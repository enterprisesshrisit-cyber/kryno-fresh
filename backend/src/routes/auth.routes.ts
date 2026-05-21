import { FastifyInstance } from 'fastify';
import {
  loginController,
  logoutController,
  refreshController,
  resendVerificationController,
  requestPasswordResetController,
  resetPasswordController,
  signupController,
  verifyEmailController
} from '../controllers/auth.controller.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/signup', signupController);
  app.post('/login', loginController);
  app.post('/verify-email', verifyEmailController);
  app.post('/resend-verification', resendVerificationController);
  app.post('/request-password-reset', requestPasswordResetController);
  app.post('/reset-password', resetPasswordController);
  app.post('/refresh', refreshController);
  app.post('/logout', logoutController);
}
