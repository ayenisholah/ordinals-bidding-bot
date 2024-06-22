import type { HTTP_GET } from "../../types/paths/pet/{petId}.types.js";
import type { HTTP_POST } from "../../types/paths/pet/{petId}.types.js";
import type { HTTP_DELETE } from "../../types/paths/pet/{petId}.types.js";

export const GET: HTTP_GET = ($) => {
  return $.response[200].random();
};

export const POST: HTTP_POST = ($) => {
  return $.response[405];
};

export const DELETE: HTTP_DELETE = ($) => {
  return $.response[400];
};
