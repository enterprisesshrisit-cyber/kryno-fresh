import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { authService } from '../services/auth.service.js';

const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;

const signupSchema = z.object({
  username: z.string().regex(usernameRegex),
  email: z.string().email(),
  password: z.string().min(10).max(128),
  device_id: z.string().min(8).max(128),
  device_name: z.string().max(120).optional(),
  device_public_key: z.string().min(16)
});

const loginSchema = z.object({
  identifier: z.string().min(3).max(320),
  password: z.string().min(10).max(128),
  device_id: z.string().min(8).max(128),
  device_name: z.string().max(120).optional(),
  device_public_key: z.string().min(16)
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/)
});

const refreshSchema = z.object({
  refresh_token: z.string().min(32),
  device_id: z.string().min(8).max(128)
});

const logoutSchema = z.object({
  refresh_token: z.string().min(32)
});

const resendVerificationSchema = z.object({
  email: z.string().email()
});

const requestPasswordResetSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  new_password: z.string().min(10).max(128)
});

function requestMeta(request: FastifyRequest) {
  return {
    ip: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null
  };
}

function parseSchema<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(' ');
    throw new AppError(400, message || 'Invalid request body.', 'VALIDATION_ERROR');
  }

  return result.data;
}

export async function signupController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(signupSchema, request.body);
  const result = await authService.signup(
    {
      username: body.username,
      email: body.email,
      password: body.password,
      deviceId: body.device_id,
      deviceName: body.device_name,
      devicePublicKey: body.device_public_key
    },
    requestMeta(request)
  );
  return reply.code(201).send(result);
}

export async function loginController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(loginSchema, request.body);
  const result = await authService.login(
    {
      identifier: body.identifier,
      password: body.password,
      deviceId: body.device_id,
      deviceName: body.device_name,
      devicePublicKey: body.device_public_key
    },
    requestMeta(request)
  );
  return reply.code(200).send(result);
}

export async function verifyEmailController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(verifyEmailSchema, request.body);
  const result = await authService.verifyEmail(body.email, body.code);
  return reply.code(200).send(result);
}

export async function refreshController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(refreshSchema, request.body);
  const result = await authService.refresh(
    {
      refreshToken: body.refresh_token,
      deviceId: body.device_id
    },
    requestMeta(request)
  );
  return reply.code(200).send(result);
}

export async function logoutController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(logoutSchema, request.body);
  const result = await authService.logout({
    refreshToken: body.refresh_token
  });
  return reply.code(200).send(result);
}

export async function resendVerificationController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(resendVerificationSchema, request.body);
  const result = await authService.resendVerification({
    email: body.email
  });
  return reply.code(200).send(result);
}

export async function requestPasswordResetController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(requestPasswordResetSchema, request.body);
  const result = await authService.requestPasswordReset(
    {
      email: body.email
    },
    requestMeta(request)
  );
  return reply.code(200).send(result);
}

export async function resetPasswordController(request: FastifyRequest, reply: FastifyReply) {
  const body = parseSchema(resetPasswordSchema, request.body);
  const result = await authService.resetPassword({
    email: body.email,
    code: body.code,
    newPassword: body.new_password
  });
  return reply.code(200).send(result);
}
