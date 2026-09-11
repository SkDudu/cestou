"use client";

import { useEffect, useMemo, useState } from "react";
import { Funnel } from "@/components/admin/ops";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type WorkerFilterRow = {
  supermarketId: string;
  supermarketName: string;
  jobs24h: number;
  taxa: number | null;
  status: string;
  lastRunAt?: number | null;
  sourceKinds?: string[];
};

export type WorkerFilter = {
  redes: string[];
  storeIds: string[];
  sources: string[];
  health: Array<"fail" | "stale" | "parseLow">;
  parse: "any" | "lt80" | "lt90";
  jobs: "any" | "zero" | "gt0";
};

const DAY = 24 * 60 * 60 * 1000;

export function emptyWorkerFilter(): WorkerFilter {
  return {
    redes: [],
    storeIds: [],
    sources: [],
    health: [],
    parse: "any",
    jobs: "any",
  };
}

export function redeOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function countWorkerFilter(f: WorkerFilter) {
  let n = 0;
  if (f.redes.length) n += 1;
  if (f.storeIds.length) n += 1;
  if (f.sources.length) n += 1;
  if (f.health.length) n += 1;
  if (f.parse !== "any") n += 1;
  if (f.jobs !== "any") n += 1;
  return n;
}

export function matchWorkerFilter(
  w: WorkerFilterRow,
  f: WorkerFilter,
  now = Date.now(),
) {
  if (f.redes.length && !f.redes.includes(redeOf(w.supermarketName))) return false;
  if (f.storeIds.length && !f.storeIds.includes(w.supermarketId)) return false;
  if (f.sources.length && !(w.sourceKinds ?? []).some((k) => f.sources.includes(k))) return false;
  if (f.health.length) {
    const hit = f.health.some((h) => {
      if (h === "fail") return w.status === "fail";
      if (h === "stale") return w.status !== "running" && (!w.lastRunAt || now - w.lastRunAt > DAY);
      return w.taxa != null && w.taxa < 0.8;
    });
    if (!hit) return false;
  }
  if (f.parse === "lt80" && !(w.taxa != null && w.taxa < 0.8)) return false;
  if (f.parse === "lt90" && !(w.taxa != null && w.taxa < 0.9)) return false;
  if (f.jobs === "zero" && w.jobs24h !== 0) return false;
  if (f.jobs === "gt0" && w.jobs24h <= 0) return false;
  return true;
}

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function WorkerFilterPopover({
  open,
  workers,
  markets,
  value,
  filterCount,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  workers: WorkerFilterRow[];
  markets: Array<{ id: string; name: string }>;
  value: WorkerFilter;
  filterCount: number;
  onOpenChange: (open: boolean) => void;
  onApply: (next: WorkerFilter) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [storeQ, setStoreQ] = useState("");
  const n = countWorkerFilter(draft);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setStoreQ("");
    }
  }, [open, value]);

  const redes = useMemo(() => {
    const set = new Set(workers.map((w) => redeOf(w.supermarketName)));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [workers]);

  const sourceOpts = useMemo(() => {
    const set = new Set(workers.flatMap((w) => w.sourceKinds ?? []));
    return (
      [
        { id: "html", label: "HTML encarte" },
        { id: "pdf", label: "PDF" },
        { id: "api", label: "API" },
      ] as const
    ).filter((o) => set.has(o.id));
  }, [workers]);

  const storeHits = useMemo(() => {
    const needle = storeQ.trim().toLowerCase();
    if (!needle) return [];
    return markets
      .filter((m) => m.name.toLowerCase().includes(needle) && !draft.storeIds.includes(m.id))
      .slice(0, 6);
  }, [markets, storeQ, draft.storeIds]);

  const selectedStores = markets.filter((m) => draft.storeIds.includes(m.id));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="ds-btn ds-btn--outline">
          <Funnel />
          Filtrar
          {filterCount ? <span className="ds-filter-count">{filterCount}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-[min(480px,calc(100vw-32px))] max-h-[min(720px,calc(100dvh-96px))] flex-col gap-5 overflow-auto border-[var(--ds-color-border)] bg-[var(--ds-color-card)] p-6 text-[var(--ds-color-ink)] shadow-md"
      >
        <PopoverHeader>
          <PopoverTitle className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]">
            Filtros
          </PopoverTitle>
          <PopoverDescription className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
            {n} {n === 1 ? "ativo" : "ativos"}. Status continua nos chips da lista.
          </PopoverDescription>
        </PopoverHeader>

        {redes.length ? (
          <section className="flex flex-col gap-2">
            <p className="text-[13px] font-medium leading-[18px]">Rede</p>
            <div className="flex flex-wrap gap-2">
              {redes.map((r) => {
                const on = draft.redes.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className={`ds-chip ds-chip--outline ${on ? "ds-chip--on" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, redes: toggle(d.redes, r) }))}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <p className="text-[13px] font-medium leading-[18px]">Loja</p>
          {selectedStores.length ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedStores.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="ds-chip ds-chip--tag"
                  onClick={() =>
                    setDraft((d) => ({ ...d, storeIds: d.storeIds.filter((id) => id !== m.id) }))
                  }
                >
                  {m.name}
                  <span className="text-[var(--ds-color-muted-foreground)]">×</span>
                </button>
              ))}
            </div>
          ) : null}
          <input
            value={storeQ}
            onChange={(e) => setStoreQ(e.target.value)}
            placeholder="Buscar loja…"
            className="ds-input"
          />
          {storeHits.length ? (
            <div className="flex flex-col overflow-hidden rounded-[6px] border border-[var(--ds-color-border)]">
              {storeHits.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="px-3 py-2 text-left text-[13px] hover:bg-[var(--ds-color-muted)]"
                  onClick={() => {
                    setDraft((d) => ({ ...d, storeIds: [...d.storeIds, m.id] }));
                    setStoreQ("");
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {sourceOpts.length ? (
          <section className="flex flex-col gap-2">
            <p className="text-[13px] font-medium leading-[18px]">Tipo de fonte</p>
            <div className="flex flex-wrap gap-2">
              {sourceOpts.map((o) => {
                const on = draft.sources.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`ds-chip ds-chip--outline ${on ? "ds-chip--on" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, sources: toggle(d.sources, o.id) }))}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <p className="text-[13px] font-medium leading-[18px]">Saúde</p>
          <div className="flex flex-col gap-2">
            {(
              [
                ["fail", "Falha"],
                ["stale", "Sem heartbeat"],
                ["parseLow", "Parse baixo"],
              ] as const
            ).map(([id, label]) => {
              const on = draft.health.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="ds-check"
                  onClick={() => setDraft((d) => ({ ...d, health: toggle(d.health, id) }))}
                >
                  <span className={`ds-check-box ${on ? "ds-check-box--on" : ""}`} />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex gap-4">
          <section className="flex w-[208px] shrink-0 flex-col gap-2">
            <p className="text-[13px] font-medium leading-[18px]">Parse %</p>
            <RadioGroup
              value={draft.parse}
              onValueChange={(v) => setDraft((d) => ({ ...d, parse: v as WorkerFilter["parse"] }))}
              className="flex flex-col gap-2"
            >
              {(
                [
                  ["lt80", "menor que 80%"],
                  ["lt90", "menor que 90%"],
                  ["any", "Qualquer"],
                ] as const
              ).map(([id, label]) => (
                <div key={id} className="flex items-center gap-3">
                  <RadioGroupItem value={id} id={`parse-${id}`} />
                  <Label htmlFor={`parse-${id}`} className="text-[13px] font-medium text-[var(--ds-color-ink)]">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </section>
          <section className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[13px] font-medium leading-[18px]">Jobs 24h</p>
            <RadioGroup
              value={draft.jobs}
              onValueChange={(v) => setDraft((d) => ({ ...d, jobs: v as WorkerFilter["jobs"] }))}
              className="flex flex-col gap-2"
            >
              {(
                [
                  ["zero", "0"],
                  ["gt0", "maior que 0"],
                  ["any", "Qualquer"],
                ] as const
              ).map(([id, label]) => (
                <div key={id} className="flex items-center gap-3">
                  <RadioGroupItem value={id} id={`jobs-${id}`} />
                  <Label htmlFor={`jobs-${id}`} className="text-[13px] font-medium text-[var(--ds-color-ink)]">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </section>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            className="text-[13px] font-medium text-[var(--ds-color-harbor)]"
            onClick={() => setDraft(emptyWorkerFilter())}
          >
            Limpar
          </button>
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => onApply(draft)}>
            Aplicar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
