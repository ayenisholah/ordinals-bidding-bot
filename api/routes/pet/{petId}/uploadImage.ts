import type { HTTP_POST } from "../../../types/paths/pet/{petId}/uploadImage.types.js";

export const POST: HTTP_POST = ($) => {
  return $.response[200].random();
};
