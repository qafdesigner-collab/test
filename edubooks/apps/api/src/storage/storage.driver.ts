import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

export interface StorageDriver {
  putFile(key: string, localPath: string, contentType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

/** Private folder on disk (development / single-server). Never served statically. */
export class LocalDriver implements StorageDriver {
  constructor(private readonly root: string) { fs.mkdirSync(root, { recursive: true }); }
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  async putFile(key: string, localPath: string) {
    const dest = this.p(key);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(localPath, dest);
  }
  async read(key: string) { return fs.createReadStream(this.p(key)); }
  async remove(key: string) { await fs.promises.rm(this.p(key), { force: true }); }
}

/** Any S3-compatible private bucket (AWS S3, Cloudflare R2, MinIO, Wasabi…). */
export class S3Driver implements StorageDriver {
  private readonly s3 = new S3Client({
    region: config.s3.region, endpoint: config.s3.endpoint, forcePathStyle: !!config.s3.endpoint,
    credentials: config.s3.accessKeyId ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey! } : undefined,
  });
  constructor(private readonly bucket: string) {}
  async putFile(key: string, localPath: string, contentType: string) {
    const { size } = await fs.promises.stat(localPath);
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: fs.createReadStream(localPath), ContentType: contentType, ContentLength: size }));
  }
  async read(key: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return r.Body as Readable;
  }
  async remove(key: string) { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}

export const createDriver = (): StorageDriver => {
  if (config.storageDriver === 's3') {
    if (!config.s3.bucket) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    return new S3Driver(config.s3.bucket);
  }
  return new LocalDriver(config.storageDir);
};
