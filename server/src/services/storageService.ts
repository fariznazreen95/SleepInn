import crypto from "crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const REGION = process.env.S3_REGION || "";
const BUCKET = process.env.S3_BUCKET || "";
const PRESIGN_EXPIRES = Number(process.env.PRESIGN_EXPIRES || 600);
const PUBLIC_CDN_BASE = process.env.PUBLIC_CDN_BASE || "";

// Constructable in dev (keys may be missing; we gate usage in createImagePresign)
export const s3 = new S3Client({
  region: REGION || "us-east-1",
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        }
      : undefined,
});

/** REAL presign (only works if S3 envs exist). */
export async function createImagePresign(listingId: number, contentType: string) {
  if (!REGION || !BUCKET) throw new Error("S3 not configured");
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 keys missing");
  }
  if (!contentType.startsWith("image/")) throw new Error("Unsupported content type");

  const ext = contentType.split("/")[1] || "jpg";
  const key = `listings/${listingId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 0, 10_000_000],
      ["starts-with", "$Content-Type", "image/"],
    ],
    Fields: { "Content-Type": contentType },
    Expires: PRESIGN_EXPIRES,
  });

  const publicUrl = PUBLIC_CDN_BASE
    ? `${PUBLIC_CDN_BASE}/${key}`
    : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { uploadUrl: url, fields, key, publicUrl };
}

/** DEV presign: no real upload; returns a stable image URL. */
export function createDevPresign(_contentType: string) {
  const key = `dev/${Date.now()}.jpg`;
  const publicUrl = "https://placehold.co/1024x768/png?text=SleepInn+Dev+Photo";
  // IMPORTANT: no uploadUrl/fields to prevent the client from trying to PUT "about:blank"
  return { mode: "dev", uploadUrl: null, publicUrl, key };
}
