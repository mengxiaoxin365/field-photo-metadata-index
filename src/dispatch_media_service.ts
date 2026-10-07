import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, InfraiMediaClient } from "./infrai_media_client.js";
import { indexRequestSchema, WorkOrderMediaIndexer } from "./work_order_media_index.js";

const client = new InfraiMediaClient();
const indexer = new WorkOrderMediaIndexer(client);
const port = Number(process.env.PORT ?? 3000);

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/media-index") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const input = indexRequestSchema.parse(body);
    send(response, 200, await indexer.index(input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      send(response, error.status, { error: error.code, detail: error.detail });
      return;
    }
    send(response, 500, { error: "Indexing request failed" });
  }
});

server.listen(port, () => {
  console.log(`Work-order media index listening on http://localhost:${port}`);
});
