import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check flyer lifecycle",
  { hours: 1 },
  internal.flyersInternal.checkFlyerLifecycle,
  {},
);

export default crons;
