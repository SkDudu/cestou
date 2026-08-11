/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as dashboard from "../dashboard.js";
import type * as images from "../images.js";
import type * as prices from "../prices.js";
import type * as productValidations from "../productValidations.js";
import type * as products from "../products.js";
import type * as rawProducts from "../rawProducts.js";
import type * as scrapeErrors from "../scrapeErrors.js";
import type * as scrapingJobs from "../scrapingJobs.js";
import type * as supermarkets from "../supermarkets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  dashboard: typeof dashboard;
  images: typeof images;
  prices: typeof prices;
  productValidations: typeof productValidations;
  products: typeof products;
  rawProducts: typeof rawProducts;
  scrapeErrors: typeof scrapeErrors;
  scrapingJobs: typeof scrapingJobs;
  supermarkets: typeof supermarkets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
