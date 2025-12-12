const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || process.env.S3_BUCKET_NAME;
const STORAGE_REGION = process.env.STORAGE_REGION || process.env.AWS_REGION || 'eu-central-1';
const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT;
const STORAGE_PUBLIC_BASE = (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const STORAGE_SIGNED_URL_TTL = Number(process.env.STORAGE_SIGNED_URL_TTL || 900);
const PUBLIC_UPLOAD_PATH = (process.env.STORAGE_PUBLIC_PATH || '/uploads').replace(/\/+$/, '');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const s3Client =
  STORAGE_DRIVER === 's3'
    ? new S3Client({
        region: STORAGE_REGION,
        endpoint: STORAGE_ENDPOINT || undefined,
        forcePathStyle: Boolean(STORAGE_ENDPOINT),
        credentials:
          process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      })
    : null;

function buildObjectKey(filename = 'image', productId = 'general') {
  const safeName = path.basename(filename);
  const extFromName = path.extname(safeName);
  const generated = crypto.randomUUID();
  const ext = extFromName || '';
  return path.join('products', productId, `${generated}${ext}`);
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

async function resolveImageUrl(key) {
  if (!key) return null;
  if (isAbsoluteUrl(key)) return key;

  if (STORAGE_DRIVER === 's3') {
    if (STORAGE_PUBLIC_BASE) {
      return `${STORAGE_PUBLIC_BASE}/${key}`;
    }

    if (!s3Client || !STORAGE_BUCKET) {
      throw new Error('Brak konfiguracji połączenia do S3');
    }

    const command = new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn: STORAGE_SIGNED_URL_TTL });
  }

  return `${PUBLIC_UPLOAD_PATH}/${key}`.replace(/\\/g, '/');
}

async function saveToLocal(buffer, key) {
  const targetPath = path.join(UPLOADS_DIR, key);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buffer);
  return { key, url: `${PUBLIC_UPLOAD_PATH}/${key}`.replace(/\\/g, '/') };
}

async function saveToS3(buffer, key, mimeType) {
  if (!s3Client || !STORAGE_BUCKET) {
    throw new Error('Brak konfiguracji połączenia do S3');
  }

  const command = new PutObjectCommand({
    Bucket: STORAGE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    ACL: 'private',
  });

  await s3Client.send(command);
  return { key, url: await resolveImageUrl(key) };
}

async function saveImage(buffer, { filename, mimeType, productId }) {
  const ext = mime.extension(mimeType || '') || path.extname(filename || '') || 'bin';
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  const safeFile = `image${normalizedExt}`;
  const key = buildObjectKey(safeFile, productId);

  if (STORAGE_DRIVER === 's3') {
    return saveToS3(buffer, key, mimeType);
  }

  return saveToLocal(buffer, key);
}

module.exports = {
  STORAGE_DRIVER,
  UPLOADS_DIR,
  resolveImageUrl,
  saveImage,
};
