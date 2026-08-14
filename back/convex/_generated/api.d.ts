/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as clearData from "../clearData.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as flyerErrors from "../flyerErrors.js";
import type * as flyerExtractions from "../flyerExtractions.js";
import type * as flyerPages from "../flyerPages.js";
import type * as flyerSources from "../flyerSources.js";
import type * as flyers from "../flyers.js";
import type * as flyersInternal from "../flyersInternal.js";
import type * as offers from "../offers.js";
import type * as scraperFlows from "../scraperFlows.js";
import type * as scraperRuns from "../scraperRuns.js";
import type * as scraperSteps from "../scraperSteps.js";
import type * as supermarkets from "../supermarkets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  clearData: typeof clearData;
  crons: typeof crons;
  dashboard: typeof dashboard;
  flyerErrors: typeof flyerErrors;
  flyerExtractions: typeof flyerExtractions;
  flyerPages: typeof flyerPages;
  flyerSources: typeof flyerSources;
  flyers: typeof flyers;
  flyersInternal: typeof flyersInternal;
  offers: typeof offers;
  scraperFlows: typeof scraperFlows;
  scraperRuns: typeof scraperRuns;
  scraperSteps: typeof scraperSteps;
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
