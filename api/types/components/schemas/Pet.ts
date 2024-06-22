import type { Category } from "./Category.js";
import type { Tag } from "./Tag.js";

export type Pet = {
  id?: number;
  name: string;
  category?: Category;
  photoUrls: Array<string>;
  tags?: Array<Tag>;
  status?: "available" | "pending" | "sold";
};
