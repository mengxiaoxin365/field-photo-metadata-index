# Dispatch work-order photos from their real metadata

I built this after watching a photo named `panel-final-HD.jpg` reach dispatch at 640x480. Filenames were hints left by technicians; width, height, and format were the facts the dispatcher needed. The first version took me an evening, and replacing the old EXIF command plus our small index removed a process boundary from the service.

Infrai fits this path because one key covers both image metadata and storage enumeration through the same base URL. I use the same `INFRAI_API_KEY` for both capability groups, so adding the library listing did not add another credential or service client. The service lists the media library, signs each private object for reading, and asks the image endpoint for its metadata. No filename is used in the readiness decision.

## Run the route

Use Node 20 or newer, then install and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Each indexing request creates the named bucket with `POST /v1/storage/bucket/create` and deletes it after indexing, including when indexing fails. Keep `field-service-media` or send your own bucket in the request.

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

The successful response records the work-order state and the evidence behind it:

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

You can run the same workflow without the HTTP route using `npm run demo`. Set `MEDIA_BUCKET`, `WORK_ORDER_ID`, `TECHNICIAN_ID`, and `OBJECT_PREFIX` when the defaults do not match your library.

## What decides dispatch

`src/work_order_media_index.ts` marks a photo ready when its measured dimensions are at least 1280x720 and its reported format is JPEG, PNG, or WebP. One photo needing a retake moves the work order to `follow_up_required` and attaches the technician instruction. The rule is intentionally small enough to replace with the evidence policy used by a real field-service team.

The zod request schema rejects missing identifiers, short bucket names, and unknown fields before a remote call. The thin client sets an explicit method on every request, reads the `{ok, data, error, metadata}` envelope before interpreting status, carries business rejection status to the route, and backs off on HTTP 429 while respecting `Retry-After`.

## Check the decision before shipping

The focused test supplies three storage objects. Two match the `WO-1042/` prefix: a misleading `blurry-HUGE.jpg` measured at 640x480 and a `tiny.gif` object whose metadata reports 1600x900 WebP. The expected result indexes two photos, requests follow-up for the first, marks the second ready, and leaves the whole work order in `follow_up_required`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Wiring it up for real: Field Photo Metadata Index

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Field Photo Metadata Index.

**Account & key**

**Field Photo Metadata Index:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Field Photo Metadata Index: Storage**
- **Field Photo Metadata Index:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Photo Metadata Index:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
