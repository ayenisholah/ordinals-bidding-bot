import type { HTTP_GET } from "../../../types/paths/store/order/{orderId}.types.js";
import type { HTTP_DELETE } from "../../../types/paths/store/order/{orderId}.types.js";

export const GET: HTTP_GET = ($) => {
  return $.response[200].random();
};

export const DELETE: HTTP_DELETE = ($) => {
  return $.response[400];
};
