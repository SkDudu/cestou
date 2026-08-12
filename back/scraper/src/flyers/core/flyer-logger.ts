type Level = "debug" | "info" | "error";

const order: Record<Level, number> = { debug: 0, info: 1, error: 2 };

function current(): Level {
  const l = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return l === "debug" || l === "error" ? l : "info";
}

function log(level: Level, stage: string, msg: string) {
  if (order[level] < order[current()]) return;
  const line = `[${level.toUpperCase()}][${stage}] ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export const flyerLog = {
  debug: (stage: string, msg: string) => log("debug", stage, msg),
  info: (stage: string, msg: string) => log("info", stage, msg),
  error: (stage: string, msg: string) => log("error", stage, msg),
};
