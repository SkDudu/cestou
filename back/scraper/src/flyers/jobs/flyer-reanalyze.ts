import { getFlyer } from "../core/flyer-storage.js";
import { extractPending, type ExtractPageEvent } from "./flyer-extraction.js";

export type OfferDiff = {
  name: string;
  pageNumber?: number;
  beforePrice: number;
  afterPrice: number;
};

export type ReanalyzeEvent =
  | { type: "log"; line: string; ts?: number }
  | (ExtractPageEvent & { type: "page"; ts?: number })
  | {
      type: "done";
      ok: boolean;
      updated: number;
      locked: number;
      pages: number[];
      diffs: OfferDiff[];
      offersFound?: number;
      error?: string;
      ts?: number;
    };

function offerKey(o: { name: string; pageNumber?: number }) {
  return `${o.pageNumber ?? "?"}|${o.name.trim().toLowerCase()}`;
}

function computeDiffs(
  before: Array<{
    name: string;
    price: number;
    pageNumber?: number;
    validationStatus: string;
  }>,
  after: Array<{
    name: string;
    price: number;
    pageNumber?: number;
    validationStatus: string;
  }>,
  replaced: Set<string>,
  pageSet: Set<number> | null,
): OfferDiff[] {
  const beforeMap = new Map<string, number>();
  for (const o of before) {
    if (pageSet && (o.pageNumber === undefined || !pageSet.has(o.pageNumber))) {
      continue;
    }
    if (!replaced.has(o.validationStatus)) continue;
    beforeMap.set(offerKey(o), o.price);
  }
  const diffs: OfferDiff[] = [];
  for (const o of after) {
    if (pageSet && (o.pageNumber === undefined || !pageSet.has(o.pageNumber))) {
      continue;
    }
    const key = offerKey(o);
    const prev = beforeMap.get(key);
    if (prev !== undefined && prev !== o.price) {
      diffs.push({
        name: o.name,
        pageNumber: o.pageNumber,
        beforePrice: prev,
        afterPrice: o.price,
      });
    }
  }
  return diffs;
}

/** Re-run Mimo parse on stored flyer pages (no scrape / worker flow). */
export async function reanalyzeFlyer(args: {
  flyerId: string;
  pages?: number[];
  includeLocked?: boolean;
  onEvent?: (ev: ReanalyzeEvent) => void;
}) {
  const send = (ev: ReanalyzeEvent) =>
    args.onEvent?.({ ...ev, ts: Date.now() } as ReanalyzeEvent);

  const full = await getFlyer(args.flyerId);
  if (!full) {
    send({
      type: "done",
      ok: false,
      updated: 0,
      locked: 0,
      pages: [],
      diffs: [],
      error: "Flyer not found",
    });
    return { ok: false as const, error: "Flyer not found" };
  }

  const allPages = (full.pages ?? []) as Array<{ pageNumber: number }>;
  const pageSet = args.pages?.length ? new Set(args.pages) : null;
  const targetPages = pageSet
    ? allPages.filter((p) => pageSet.has(p.pageNumber)).map((p) => p.pageNumber)
    : allPages.map((p) => p.pageNumber);

  for (const p of allPages) {
    if (pageSet && !pageSet.has(p.pageNumber)) {
      send({
        type: "page",
        pageNumber: p.pageNumber,
        status: "skipped",
      });
    }
  }

  const replaceStatuses = args.includeLocked
    ? (["pending", "validated", "rejected", "suspicious"] as const)
    : (["pending", "rejected"] as const);
  const replaced = new Set<string>(replaceStatuses);

  const before = (full.offers ?? []) as Array<{
    name: string;
    price: number;
    pageNumber?: number;
    validationStatus: string;
  }>;
  const locked = before.filter((o) => {
    if (pageSet && (o.pageNumber === undefined || !pageSet.has(o.pageNumber))) {
      return false;
    }
    return (
      o.validationStatus === "validated" ||
      o.validationStatus === "suspicious"
    );
  }).length;

  send({
    type: "log",
    line: `reanalisar flyer=${args.flyerId} pages=${targetPages.join(",") || "all"} includeLocked=${Boolean(args.includeLocked)}`,
  });

  let pageFailed = 0;
  let pageDone = 0;
  try {
    const result = await extractPending({
      force: true,
      flyerIds: [args.flyerId],
      pageNumbers: pageSet ? targetPages : undefined,
      replaceStatuses: [...replaceStatuses],
      onLog: (line) => send({ type: "log", line }),
      onPage: (ev) => {
        if (ev.status === "failed") pageFailed++;
        if (ev.status === "done") pageDone++;
        send({ type: "page", ...ev });
      },
    });

    const afterFull = await getFlyer(args.flyerId);
    const after = (afterFull?.offers ?? []) as Array<{
      name: string;
      price: number;
      pageNumber?: number;
      validationStatus: string;
    }>;
    const diffs = computeDiffs(before, after, replaced, pageSet);
    const ok = pageDone > 0 || result.offersFound > 0;
    const updated = diffs.length > 0 ? diffs.length : result.offersFound;

    send({
      type: "done",
      ok,
      updated,
      locked: args.includeLocked ? 0 : locked,
      pages: targetPages,
      diffs,
      offersFound: result.offersFound,
      error: ok
        ? undefined
        : pageFailed
          ? `parse falhou em ${pageFailed} página(s)`
          : "nenhuma oferta reprocessada",
    });
    return {
      ok,
      updated,
      locked: args.includeLocked ? 0 : locked,
      pages: targetPages,
      diffs,
      offersFound: result.offersFound,
      error: ok
        ? undefined
        : pageFailed
          ? `parse falhou em ${pageFailed} página(s)`
          : "nenhuma oferta reprocessada",
    };
  } catch (err) {
    send({
      type: "done",
      ok: false,
      updated: 0,
      locked: args.includeLocked ? 0 : locked,
      pages: targetPages,
      diffs: [],
      error: String(err),
    });
    return { ok: false as const, error: String(err) };
  }
}
