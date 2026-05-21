import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buffer as streamToBuffer } from 'node:stream/consumers';
import { env } from '../config/env.js';

type StorageNamespace = 'attachments' | 'social';

type PutObjectInput = {
  key: string;
  bytes: Buffer;
  contentType?: string;
  cacheControl?: string;
};

type ObjectStorage = {
  putObject: (input: PutObjectInput) => Promise<void>;
  getObject: (key: string) => Promise<Buffer>;
  deleteObject: (key: string) => Promise<void>;
  getPublicUrl?: (key: string) => string;
};

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinUrl(baseUrl: string, ...parts: string[]) {
  const normalizedBase = baseUrl.replace(/\/+$/g, '');
  const normalizedPath = parts.map(trimSlashes).filter(Boolean).join('/');
  return `${normalizedBase}/${normalizedPath}`;
}

async function responseBodyToBuffer(body: unknown) {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body instanceof Readable) {
    return streamToBuffer(body);
  }

  const maybeBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof maybeBody.transformToByteArray === 'function') {
    return Buffer.from(await maybeBody.transformToByteArray());
  }

  if (typeof maybeBody.arrayBuffer === 'function') {
    return Buffer.from(await maybeBody.arrayBuffer());
  }

  throw new Error('Unsupported object storage response body.');
}

class LocalObjectStorage implements ObjectStorage {
  constructor(
    private readonly rootDir: string,
    private readonly publicPrefix?: string
  ) {}

  private resolvePath(key: string) {
    return path.resolve(this.rootDir, key);
  }

  async putObject(input: PutObjectInput) {
    const storagePath = this.resolvePath(input.key);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.writeFile(storagePath, input.bytes);
  }

  async getObject(key: string) {
    return fs.readFile(this.resolvePath(key));
  }

  async deleteObject(key: string) {
    await fs.unlink(this.resolvePath(key)).catch(() => undefined);
  }

  getPublicUrl(key: string) {
    if (!this.publicPrefix) {
      throw new Error('This local storage namespace has no public URL.');
    }

    return joinUrl(this.publicPrefix, key);
  }
}

class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly keyPrefix: string;

  constructor(
    namespace: StorageNamespace,
    private readonly bucket: string,
    private readonly publicBaseUrl?: string
  ) {
    const endpoint =
      env.R2_ENDPOINT ??
      (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

    this.client = new S3Client({
      region: env.R2_REGION,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? ''
      }
    });
    this.keyPrefix = namespace;
  }

  private objectKey(key: string) {
    return `${this.keyPrefix}/${trimSlashes(key)}`;
  }

  async putObject(input: PutObjectInput) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(input.key),
        Body: input.bytes,
        ContentType: input.contentType,
        CacheControl: input.cacheControl
      })
    );
  }

  async getObject(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key)
      })
    );

    return responseBodyToBuffer(response.Body);
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key)
      })
    );
  }

  getPublicUrl(key: string) {
    if (!this.publicBaseUrl) {
      throw new Error('S3 social media storage requires a public base URL.');
    }

    return joinUrl(this.publicBaseUrl, this.keyPrefix, key);
  }
}

function createObjectStorage(namespace: StorageNamespace, localDir: string, publicPrefix?: string): ObjectStorage {
  if (env.MEDIA_STORAGE_DRIVER === 's3') {
    return new S3ObjectStorage(namespace, env.R2_BUCKET ?? '', env.R2_PUBLIC_BASE_URL);
  }

  return new LocalObjectStorage(localDir, publicPrefix);
}

export const attachmentStorage = createObjectStorage('attachments', env.ATTACHMENT_STORAGE_DIR);
export const socialMediaStorage = createObjectStorage('social', env.SOCIAL_MEDIA_STORAGE_DIR, '/media');
