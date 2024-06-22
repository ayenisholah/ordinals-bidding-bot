import type { HTTP_GET } from "../../types/paths/user/{username}.types.js";
import type { HTTP_PUT } from "../../types/paths/user/{username}.types.js";
import type { HTTP_DELETE } from "../../types/paths/user/{username}.types.js";

export const GET: HTTP_GET = ($) => {
  return $.response[200].random();
};

export const PUT: HTTP_PUT = ($) => {
  return $.response[200];
};

export const DELETE: HTTP_DELETE = ($) => {
  return $.response[400];
};
