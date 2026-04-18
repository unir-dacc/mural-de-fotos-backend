import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface UploadFileParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder?: string;
}

export interface UploadFileResult {
  key: string;
  url: string;
}

@Injectable()
export class AwsUploadService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_KEY');
    const bucket = this.configService.get<string>('AWS_PUBLIC_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'AWS S3 envs ausentes: verifique AWS_REGION, AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_PUBLIC_BUCKET_NAME',
      );
    }

    this.bucket = bucket;

    this.publicBaseUrl = `https://${this.bucket}.s3.${region}.amazonaws.com`;

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const { buffer, fileName, mimeType, folder } = params;

    const safeFolder = folder?.replace(/\/+$/, '');
    const timestamp = Date.now();
    const key = safeFolder
      ? `${safeFolder}/${timestamp}-${fileName}`
      : `${timestamp}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'public-read',
    });

    await this.s3.send(command);

    const url = `${this.publicBaseUrl}/${key}`;

    return { key, url };
  }
}
