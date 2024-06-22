import type { HTTP_PUT } from "../types/paths/pet.types.js";
import type { HTTP_POST } from "../types/paths/pet.types.js";

export const PUT: HTTP_PUT = ($) => {
  return $.response[200].random();
};

export const POST: HTTP_POST = ($) => {
  return $.response[200].random();
};
