// This code was automatically generated from an OpenAPI description.
// Do not edit this file. Edit the OpenAPI file instead.
// For more information, see https://github.com/pmcelhaney/counterfact/blob/main/docs/faq-generated-code.md

import type { WideOperationArgument } from "../../../types.d.ts";
import type { OmitValueWhenNever } from "../../../types.d.ts";
import type { Context } from "../../../routes/_.context.ts";
import type { ResponseBuilderFactory } from "../../../types.d.ts";
import type { HttpStatusCode } from "../../../types.d.ts";
import type { User } from "../../components/schemas/User.js";

export type HTTP_POST = (
  $: OmitValueWhenNever<{
    query: never;
    path: never;
    header: never;
    body: Array<User>;
    context: Context;
    response: ResponseBuilderFactory<{
      200: {
        headers: never;
        requiredHeaders: never;
        content: {
          "application/xml": {
            schema: User;
          };
          "application/json": {
            schema: User;
          };
        };
      };
      [statusCode in Exclude<HttpStatusCode, 200>]: {
        headers: never;
        requiredHeaders: never;
        content: never;
      };
    }>;
    x: WideOperationArgument;
    proxy: (url: string) => "COUNTERFACT_RESPONSE";
    user: never;
  }>,
) =>
  | {
      status: 200;
      contentType?: "application/xml";
      body?: User;
    }
  | {
      status: 200;
      contentType?: "application/json";
      body?: User;
    }
  | {
      status: number | undefined;
    }
  | { status: 415; contentType: "text/plain"; body: string }
  | "COUNTERFACT_RESPONSE"
  | { ALL_REMAINING_HEADERS_ARE_OPTIONAL: "COUNTERFACT_RESPONSE" };
