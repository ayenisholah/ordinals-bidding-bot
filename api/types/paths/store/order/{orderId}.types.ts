// This code was automatically generated from an OpenAPI description.
// Do not edit this file. Edit the OpenAPI file instead.
// For more information, see https://github.com/pmcelhaney/counterfact/blob/main/docs/faq-generated-code.md

import type { WideOperationArgument } from "../../../../types.d.ts";
import type { OmitValueWhenNever } from "../../../../types.d.ts";
import type { Context } from "../../../../routes/_.context.ts";
import type { ResponseBuilderFactory } from "../../../../types.d.ts";
import type { Order } from "../../../components/schemas/Order.js";

export type HTTP_GET = (
  $: OmitValueWhenNever<{
    query: never;
    path: { orderId: number };
    header: never;
    body: never;
    context: Context;
    response: ResponseBuilderFactory<{
      200: {
        headers: never;
        requiredHeaders: never;
        content: {
          "application/xml": {
            schema: Order;
          };
          "application/json": {
            schema: Order;
          };
        };
      };
      400: {
        headers: never;
        requiredHeaders: never;
        content: never;
      };
      404: {
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
      body?: Order;
    }
  | {
      status: 200;
      contentType?: "application/json";
      body?: Order;
    }
  | {
      status: 400;
    }
  | {
      status: 404;
    }
  | { status: 415; contentType: "text/plain"; body: string }
  | "COUNTERFACT_RESPONSE"
  | { ALL_REMAINING_HEADERS_ARE_OPTIONAL: "COUNTERFACT_RESPONSE" };

export type HTTP_DELETE = (
  $: OmitValueWhenNever<{
    query: never;
    path: { orderId: number };
    header: never;
    body: never;
    context: Context;
    response: ResponseBuilderFactory<{
      400: {
        headers: never;
        requiredHeaders: never;
        content: never;
      };
      404: {
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
      status: 400;
    }
  | {
      status: 404;
    }
  | { status: 415; contentType: "text/plain"; body: string }
  | "COUNTERFACT_RESPONSE"
  | { ALL_REMAINING_HEADERS_ARE_OPTIONAL: "COUNTERFACT_RESPONSE" };