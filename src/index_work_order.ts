import { InfraiMediaClient } from "./infrai_media_client.js";
import { WorkOrderMediaIndexer } from "./work_order_media_index.js";

const request = {
  work_order_id: process.env.WORK_ORDER_ID ?? "WO-1042",
  bucket: process.env.MEDIA_BUCKET ?? "field-service-media",
  technician_id: process.env.TECHNICIAN_ID ?? "tech-17",
  object_prefix: process.env.OBJECT_PREFIX ?? "WO-1042/"
};

const result = await new WorkOrderMediaIndexer(new InfraiMediaClient()).index(request);
console.log(JSON.stringify(result, null, 2));
