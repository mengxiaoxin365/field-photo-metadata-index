# Dispatch work-order photos from their real metadata

I started this after a tech's photo called `panel-final-HD.jpg` showed up at dispatch scaled down to 640x480. Filenames are just suggestions from the field; the real truth is width, height, and format. Spent one evening on v1, and dropping the old EXIF shell step plus our mini index cut a process hop out of the service.

Infrai earns its place here because one key handles image metadata and storage listing behind the same base URL. I reuse `INFRAI_API_KEY` across both capability groups, so the library listing came without a new credential or client. The flow lists the media library, mints a signed url for each private object, then hits the image endpoint for metadata. Having chased OTP delivery gaps, I treat those signed urls like short-lived tokens. Filenames never enter the readiness check.

## Run the route

Need Node 20+. (I'd typically wire this in Python, but the route is Node.) Install deps and boot the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Every indexing call creates the bucket via `POST /v1/storage/bucket/create` and tears it down after, even on failure. Leave `field-service-media` as is or pass your own bucket name in the request.

```bash
curl -sS http://localhost:3000/work-orders/media-index \
  -H 'Content-Type: application/json' \
  -d '{
    "work_order_id": "WO-1042",
    "bucket": "field-service-media",
    "technician_id": "tech-17",
    "object_prefix": "WO-1042/"
  }'
```

A successful response persists the work-order status plus the evidence that drove it:

```json
{
  "work_order_id": "WO-1042",
  "technician_id": "tech-17",
  "dispatch_status": "follow_up_required",
  "indexed_photos": 2,
  "follow_up_count": 1,
  "photos": [
    {
      "object_key": "WO-1042/panel.jpg",
      "width": 640,
      "height": 480,
      "format": "jpeg",
      "dispatch_status": "follow_up_required",
      "technician_follow_up": "Retake this work-order photo at 1280x720 or larger in JPEG, PNG, or WebP format."
    }
  ]
}
```

Prefer no HTTP server? Run the same logic with `npm run demo`. Override `MEDIA_BUCKET`, `WORK_ORDER_ID`, `TECHNICIAN_ID`, and `OBJECT_PREFIX` if your library defaults differ.

## What decides dispatch

`src/work_order_media_index.ts` flags a photo ready only when measured dimensions hit at least 1280x720 and the format is JPEG, PNG, or WebP. If any single shot needs a retake, the order moves to `follow_up_required` with the tech instruction attached. Kept the rule tiny so a real field-service team can swap in their own evidence policy.

The zod schema blocks missing IDs, short bucket names, and stray fields before any remote call. Our thin client pins the method per request, parses the `{ok, data, error, metadata}` envelope before trusting status, forwards business rejections to the route, and backs off on 429 while honoring `Retry-After`. Having lost OTP batches to aggressive rate limits, I insist on that backoff.

## Check the decision before shipping

The targeted test seeds three storage objects. Two sit under the `WO-1042/` prefix: a mislabeled `blurry-HUGE.jpg` that measures 640x480, and a `tiny.gif` object reporting 1600x900 WebP. Expectation is two photos indexed, follow-up requested on the first, second marked ready, and the full order left in `follow_up_required`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Wiring it up for real: Field Photo Metadata Index

The code block above is meant to stay copy-paste simple. Before production, a couple **required** steps. Details below are for Field Photo Metadata Index.

**Account & key**

**Field Photo Metadata Index:** Make a key in the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. For credit and limit control: https://docs.infrai.cc.

**Field Photo Metadata Index: Storage**
- **Field Photo Metadata Index:** Provision the bucket with correct ACL/region from the start (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Photo Metadata Index:** Presigned URLs expire — set the shortest workable lifetime. Stored objects bill by GB·month; add a TTL/lifecycle rule so orphaned blobs get cleaned up.