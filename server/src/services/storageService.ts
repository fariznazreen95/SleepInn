// sleepinn/server/src/services/storageService.ts
import crypto from "crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const REGION = process.env.S3_REGION!;
const BUCKET = process.env.S3_BUCKET!;
const PRESIGN_EXPIRES = Number(process.env.PRESIGN_EXPIRES || 600);
const PUBLIC_CDN_BASE = process.env.PUBLIC_CDN_BASE || "";

// You can leave these envs empty for now if you're not testing uploads yet.
// The presign route will throw a clear error if any are missing.
export const s3 = new S3Client({
  region: REGION || "us-east-1",
  credentials: (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY)
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      }
    : undefined,
});

/**
 * Create a presigned POST for image upload.
 * Returns { url, fields, key, publicUrl }.
 */
export async function createImagePresign(listingId: number, contentType: string) {
  if (!REGION || !BUCKET) {
    throw new Error("Storage not configured: set S3_REGION and S3_BUCKET in .env");
  }
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error("Storage keys missing: set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in .env");
  }
  if (!contentType.startsWith("image/")) {
    throw new Error("Unsupported content type (must start with image/)");
  }

  const ext = contentType.split("/")[1] || "jpg";
  const key = `listings/${listingId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 0, 5_000_000],
      ["starts-with", "$Content-Type", "image/"],
    ],
    Fields: { "Content-Type": contentType },
    Expires: PRESIGN_EXPIRES,
  });

  const publicUrl = PUBLIC_CDN_BASE
    ? `${PUBLIC_CDN_BASE}/${key}`
    : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { url, fields, key, publicUrl };
}
