import { z } from "zod";
import type { ImageMetadata } from "./infrai_media_client.js";

export const indexRequestSchema = z.object({
  work_order_id: z.string().trim().min(1),
  bucket: z.string().trim().min(3),
  technician_id: z.string().trim().min(1),
  object_prefix: z.string().default("")
}).strict();

export type IndexRequest = z.infer<typeof indexRequestSchema>;

export type PhotoAssessment = {
  object_key: string;
  width: number;
  height: number;
  format: string;
  dispatch_status: "ready" | "follow_up_required";
  technician_follow_up: string | null;
};

const dispatchFormats = new Set(["jpeg", "jpg", "png", "webp"]);

export function assessPhoto(objectKey: string, metadata: ImageMetadata): PhotoAssessment {
  const format = metadata.format.toLowerCase();
  const enoughDetail = metadata.width >= 1280 && metadata.height >= 720;
  const dispatchReady = enoughDetail && dispatchFormats.has(format);

  return {
    object_key: objectKey,
    width: metadata.width,
    height: metadata.height,
    format,
    dispatch_status: dispatchReady ? "ready" : "follow_up_required",
    technician_follow_up: dispatchReady
      ? null
      : "Retake this work-order photo at 1280x720 or larger in JPEG, PNG, or WebP format."
  };
}

export interface MediaLibrary {
  createBucket(name: string): Promise<void>;
  deleteBucket(bucket: string): Promise<void>;
  listObjects(bucket: string): Promise<Array<{ key: string }>>;
  signedReadUrl(bucket: string, key: string): Promise<string>;
  readImageMetadata(image: string): Promise<ImageMetadata>;
}

export class WorkOrderMediaIndexer {
  private readonly media: MediaLibrary;

  constructor(media: MediaLibrary) {
    this.media = media;
  }

  async index(input: IndexRequest) {
    await this.media.createBucket(input.bucket);
    try {
      const objects = await this.media.listObjects(input.bucket);
      const selected = objects.filter(({ key }) => key.startsWith(input.object_prefix));

      const photos = await Promise.all(selected.map(async ({ key }) => {
        const signedUrl = await this.media.signedReadUrl(input.bucket, key);
        const metadata = await this.media.readImageMetadata(signedUrl);
        return assessPhoto(key, metadata);
      }));

      const followUpCount = photos.filter((photo) => photo.dispatch_status === "follow_up_required").length;
      return {
        work_order_id: input.work_order_id,
        technician_id: input.technician_id,
        dispatch_status: followUpCount === 0 ? "ready" as const : "follow_up_required" as const,
        indexed_photos: photos.length,
        follow_up_count: followUpCount,
        photos
      };
    } finally {
      await this.media.deleteBucket(input.bucket);
    }
  }
}
