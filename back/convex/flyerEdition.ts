/** Same listing slot (URL / #oferta-N) can hold a new edition after the old one expires. */

export type FlyerEdition = {
  status: string;
  validFrom?: number;
  validUntil?: number;
  pageUrls?: string[];
};

export function pagePath(url: string): string {
  return url.split("?")[0].split("#")[0];
}

function pagePaths(urls: string[]): Set<string> {
  return new Set(urls.map(pagePath).filter(Boolean));
}

export function pagesOverlap(a?: string[], b?: string[]): boolean | undefined {
  if (!a?.length || !b?.length) return undefined;
  const B = pagePaths(b);
  for (const p of pagePaths(a)) {
    if (B.has(p)) return true;
  }
  return false;
}

export function sameFlyerEdition(
  existing: FlyerEdition,
  incoming: { validFrom?: number; validUntil?: number; pageUrls?: string[] },
  now = Date.now(),
): boolean {
  if (existing.status === "expired") return false;
  if (existing.validUntil !== undefined && existing.validUntil < now) {
    return false;
  }
  if (
    incoming.validFrom !== undefined &&
    incoming.validUntil !== undefined &&
    existing.validFrom !== undefined &&
    existing.validUntil !== undefined &&
    (existing.validFrom !== incoming.validFrom ||
      existing.validUntil !== incoming.validUntil)
  ) {
    return false;
  }
  const overlap = pagesOverlap(existing.pageUrls, incoming.pageUrls);
  if (overlap === false) return false;
  return true;
}

{
  const now = 1_700_000_000_000;
  const expired = {
    status: "expired" as const,
    validFrom: now - 20,
    validUntil: now - 1,
    pageUrls: ["https://cdn.example/old.jpg"],
  };
  if (sameFlyerEdition(expired, { pageUrls: ["https://cdn.example/new.jpg"] }, now)) {
    throw new Error("expired slot must be a new flyer");
  }
  const live = {
    status: "processed",
    validFrom: now - 10,
    validUntil: now + 10,
    pageUrls: ["https://cdn.example/a.jpg"],
  };
  if (
    !sameFlyerEdition(
      live,
      {
        validFrom: now - 10,
        validUntil: now + 10,
        pageUrls: ["https://cdn.example/a.jpg"],
      },
      now,
    )
  ) {
    throw new Error("same dates + pages is the same flyer");
  }
  if (
    sameFlyerEdition(
      live,
      {
        validFrom: now + 20,
        validUntil: now + 30,
        pageUrls: ["https://cdn.example/b.jpg"],
      },
      now,
    )
  ) {
    throw new Error("new validity in the same slot is a new flyer");
  }
}
