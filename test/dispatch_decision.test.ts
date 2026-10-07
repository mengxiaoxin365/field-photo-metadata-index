import assert from "node:assert/strict";
import test from "node:test";
import type { MediaLibrary } from "../src/work_order_media_index.js";
import { WorkOrderMediaIndexer } from "../src/work_order_media_index.js";

test("metadata, rather than filename, controls technician follow-up", async () => {
  const calls: string[] = [];
  const media: MediaLibrary = {
    async createBucket(name) { calls.push(`create:${name}`); },
    async deleteBucket(name) { calls.push(`delete:${name}`); },
    async listObjects() {
      return [{ key: "WO-1042/blurry-HUGE.jpg" }, { key: "WO-1042/tiny.gif" }, { key: "OTHER/photo.jpg" }];
    },
    async signedReadUrl(_bucket, key) { return `https://media.example/${key}`; },
    async readImageMetadata(image) {
      return image.endsWith("blurry-HUGE.jpg")
        ? { width: 640, height: 480, format: "jpeg" }
        : { width: 1600, height: 900, format: "webp" };
    }
  };

  const result = await new WorkOrderMediaIndexer(media).index({
    work_order_id: "WO-1042",
    bucket: "field-service-media",
    technician_id: "tech-17",
    object_prefix: "WO-1042/"
  });

  assert.deepEqual(calls, ["create:field-service-media", "delete:field-service-media"]);
  assert.equal(result.indexed_photos, 2);
  assert.equal(result.dispatch_status, "follow_up_required");
  assert.deepEqual(result.photos.map((photo) => photo.dispatch_status), ["follow_up_required", "ready"]);
  assert.match(result.photos[0].technician_follow_up ?? "", /1280x720/);
});

test("deletes the created bucket when indexing fails", async () => {
  const calls: string[] = [];
  const media: MediaLibrary = {
    async createBucket(name) { calls.push(`create:${name}`); },
    async deleteBucket(name) { calls.push(`delete:${name}`); },
    async listObjects() { throw new Error("list failed"); },
    async signedReadUrl() { throw new Error("unexpected presign"); },
    async readImageMetadata() { throw new Error("unexpected metadata"); }
  };

  await assert.rejects(() => new WorkOrderMediaIndexer(media).index({
    work_order_id: "WO-1042",
    bucket: "field-service-media",
    technician_id: "tech-17",
    object_prefix: "WO-1042/"
  }), /list failed/);

  assert.deepEqual(calls, ["create:field-service-media", "delete:field-service-media"]);
});
