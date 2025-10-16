#!/usr/bin/env node

/**
 * One-time migration helper that copies the existing filesystem-backed storage
 * under ./storage into the configured S3/MinIO bucket, preserving metadata
 * sidecars and S3 object metadata.
 *
 * Usage:
 *   node scripts/migrateLocalToS3.js [--dry-run] [--skip-existing]
 *
 * Flags:
 *   --dry-run        Print planned actions without uploading anything.
 *   --skip-existing  Skip objects that already exist in the bucket (HEAD check).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PutObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import storageService from '../src/services/storageService.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const storageRoot = path.join(projectRoot, 'storage');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipExisting = args.has('--skip-existing');

if (config.storage.type !== 's3') {
  console.error('ERROR: STORAGE_TYPE must be set to "s3" before running this migration.');
  console.error('Update your .env and restart the app, then retry.');
  process.exit(1);
}

async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function* walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else {
      yield fullPath;
    }
  }
}

async function objectExists(bucket, key) {
  try {
    await storageService.s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // MinIO returns NoSuchKey for missing objects
    if (error?.Code === 'NotFound' || error?.Code === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

async function migrate() {
  const exists = await directoryExists(storageRoot);
  if (!exists) {
    console.log('Nothing to migrate – local ./storage directory not found.');
    return;
  }

  await storageService.ensureReady();

  console.log(`Migrating local storage from ${storageRoot}`);
  console.log(`Target bucket: ${config.storage.s3.bucket}`);
  if (dryRun) {
    console.log('Running in DRY RUN mode – no changes will be made.');
  }

  let uploaded = 0;
  let skipped = 0;

  for await (const filePath of walkFiles(storageRoot)) {
    const relative = path.relative(storageRoot, filePath);
    const s3Key = relative.split(path.sep).join('/');
    const isMetadataSidecar = s3Key.endsWith('.meta.json');

    if (skipExisting && await objectExists(config.storage.s3.bucket, s3Key)) {
      console.log(`Skipping existing object: ${s3Key}`);
      skipped += 1;
      continue;
    }

    const data = await fs.readFile(filePath);

    if (dryRun) {
      console.log(`[DRY RUN] ${isMetadataSidecar ? 'Meta' : 'File'} -> ${s3Key} (${data.length} bytes)`);
      continue;
    }

    if (isMetadataSidecar) {
      const command = new PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: s3Key,
        Body: data,
        ContentType: 'application/json',
        CacheControl: 'no-store'
      });
      await storageService.s3Client.send(command);
      console.log(`Uploaded metadata: ${s3Key}`);
    } else {
      let metadataPayload = null;
      const metaPath = `${filePath}.meta.json`;
      const hasMetaSidecar = await fileExists(metaPath);

      if (hasMetaSidecar) {
        const metaContent = await fs.readFile(metaPath, 'utf8');
        metadataPayload = JSON.parse(metaContent);
      } else {
        // Build fallback metadata payload if none exists
        const fallbackContentType = storageService.getContentType(path.basename(filePath));
        metadataPayload = storageService.buildMetadataPayload(fallbackContentType, data.length, {});
      }

      // Ensure we linearize metadata into S3 user metadata format
      const metadata = storageService.convertToS3Metadata(metadataPayload);
      const contentType = metadataPayload.contentType || storageService.getContentType(path.basename(filePath));
      const cacheControl = metadataPayload.access === 'public'
        ? 'public, max-age=31536000'
        : 'private, max-age=0, no-transform, s-maxage=0';

      const command = new PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: s3Key,
        Body: data,
        ContentType: contentType,
        CacheControl: cacheControl,
        Metadata: metadata
      });

      await storageService.s3Client.send(command);
      console.log(`Uploaded file: ${s3Key}`);

      // Upload sidecar if it did not exist originally
      if (!hasMetaSidecar && metadataPayload) {
        const metaBody = JSON.stringify(metadataPayload, null, 2);
        const metaCommand = new PutObjectCommand({
          Bucket: config.storage.s3.bucket,
          Key: `${s3Key}.meta.json`,
          Body: metaBody,
          ContentType: 'application/json',
          CacheControl: 'no-store'
        });
        await storageService.s3Client.send(metaCommand);
        console.log(`Created metadata sidecar: ${s3Key}.meta.json`);
      }
    }

    uploaded += 1;
  }

  console.log('Migration complete.');
  console.log(`Uploaded objects: ${uploaded}`);
  if (skipExisting) {
    console.log(`Skipped existing: ${skipped}`);
  }
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
