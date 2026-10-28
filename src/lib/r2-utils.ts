import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT!,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  })
}

export async function copyAndDelete(
  s3: S3Client,
  sourceKey: string,
  destKey: string
): Promise<void> {
  await s3.send(new CopyObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    CopySource: `${process.env.R2_BUCKET!}/${sourceKey}`,
    Key: destKey,
    MetadataDirective: 'COPY',
  }));
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: sourceKey,
  }));
}
