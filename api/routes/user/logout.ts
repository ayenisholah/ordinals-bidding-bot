import type { HTTP_GET } from "../../types/paths/user/logout.types.js";

export const GET: HTTP_GET = ($) => {
  return $.response[200];
};
