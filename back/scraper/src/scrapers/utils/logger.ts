type Level = "debug" | "info" | "error";

const order: Record<Level, number> = { debug: 0, info: 1, error: 2 };

function current(): Level {
  const l = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return l === "debug" || l === "error" ? l : "info";
}

function log(level: Level, msg: string) {
  if (order[level] < order[current()]) return;
  const tag = level.toUpperCase();
  const line = `[${tag}] ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string) => log("debug", msg),
  info: (msg: string) => log("info", msg),
  error: (msg: string) => log("error", msg),
};
