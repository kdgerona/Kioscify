import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';

function publicReadPolicy(bucket: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
}

@Injectable()
export class StorageService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
    this.bucket = process.env.MINIO_BUCKET || 'kioscify';
    this.publicUrl = (process.env.MINIO_PUBLIC_URL || 'http://kioscify.localhost/storage').replace(/\/$/, '');
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
    await this.client.setBucketPolicy(
      this.bucket,
      JSON.stringify(publicReadPolicy(this.bucket)),
    );
  }

  async upload(folder: string, filename: string, buffer: Buffer, mimetype: string): Promise<string> {
    const key = `${folder}/${filename}`;
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimetype,
    });
    return `${this.publicUrl}/${key}`;
  }

  async delete(fileUrl: string): Promise<void> {
    try {
      const key = this.extractKey(fileUrl);
      if (key) await this.client.removeObject(this.bucket, key);
    } catch {
      // best-effort: log nothing, don't fail the request
    }
  }

  private extractKey(url: string): string | null {
    if (!url) return null;
    // Only handle URLs pointing to our MinIO storage proxy path
    if (url.includes('/storage/')) {
      return url.split('/storage/').pop() || null;
    }
    return null;
  }
}
