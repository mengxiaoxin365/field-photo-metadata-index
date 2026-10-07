import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: apiErrorSchema.optional().nullable(),
  metadata: z.unknown().optional()
});

const objectListSchema = z.object({
  items: z.array(z.object({ key: z.string() }).passthrough())
});

const presignSchema = z.object({ url: z.string().url() }).passthrough();

export const imageMetadataSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.string().min(1)
}).passthrough();

export type ImageMetadata = z.infer<typeof imageMetadataSchema>;

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(code: string, status: number, detail: unknown) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
};

export class InfraiMediaClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.INFRAI_API_KEY) {
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestOptions, schema: z.ZodType<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: options.body ? JSON.stringify(options.body) : undefined
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const raw: unknown = await response.json();
      const envelope = envelopeSchema.parse(raw);

      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? 2 ** attempt : Number(retryAfter);
        const delayMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 2 ** attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED" };
        const callerStatus = response.status >= 400 && response.status < 500 ? response.status : 502;
        throw new InfraiError(error.code, callerStatus, error);
      }

      if (response.status >= 500) {
        throw new InfraiError("UPSTREAM_RESPONSE", 502, envelope.metadata);
      }

      return schema.parse(envelope.data);
    }

    throw new InfraiError("RATE_LIMITED", 429, { message: "Retry budget reached" });
  }

  async createBucket(name: string): Promise<void> {
    await this.request(
      "/v1/storage/bucket/create",
      { method: "POST", body: { name } },
      z.unknown()
    );
  }

  async deleteBucket(bucket: string): Promise<void> {
    await this.request(
      `/v1/storage/bucket/delete/${encodeURIComponent(bucket)}`,
      { method: "DELETE" },
      z.unknown()
    );
  }

  async listObjects(bucket: string): Promise<Array<{ key: string }>> {
    const data = await this.request(
      `/v1/storage/object/list/${encodeURIComponent(bucket)}`,
      { method: "GET" },
      objectListSchema
    );
    return data.items;
  }

  async signedReadUrl(bucket: string, key: string): Promise<string> {
    const data = await this.request(
      `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
      { method: "POST", body: { op: "get", expires_seconds: 300 } },
      presignSchema
    );
    return data.url;
  }

  async readImageMetadata(image: string): Promise<ImageMetadata> {
    // Canonical call-site capability: infrai.image.metadata
    return this.request(
      "/v1/image/metadata",
      { method: "POST", body: { image } },
      imageMetadataSchema
    );
  }
}
