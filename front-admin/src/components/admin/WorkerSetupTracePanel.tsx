"use client";

import { useEffect, useMemo, useState } from "react";
import { formatOpsStamp } from "@/lib/format";

export type SetupTraceEvent = {
  _id: string;
  order: number;
  at: number;
  kind: string;
  label: string;
  sessionId?: string;
  payload?: string;
};

const KIND_META: Record<
  string,
  { title: string; color: string; group?: string }
> = {
  flow_created: { title: "Criação", color: "#6366f1", group: "setup" },
  session_start: { title: "Sessão", color: "#0ea5e9", group: "teach" },
  session_close: { title: "Sessão", color: "#64748b", group: "teach" },
  navigation: { title: "Nav", color: "#94a3b8", group: "teach" },
  click: { title: "Clique", color: "#f59e0b", group: "teach" },
  input: { title: "Input", color: "#a78bfa", group: "teach" },
  scroll: { title: "Scroll", color: "#94a3b8", group: "teach" },
  scope: { title: "Escopo", color: "#10b981", group: "teach" },
  locate: { title: "MiMo", color: "#8b5cf6", group: "analyze" },
  analyze: { title: "Análise", color: "#8b5cf6", group: "analyze" },
  confirm_scope: { title: "Aprovar", color: "#22c55e", group: "analyze" },
  preview: { title: "Teste", color: "#06b6d4", group: "validate" },
  save: { title: "Salvar", color: "#16a34a", group: "persist" },
  skip_flyer: { title: "Ignorar", color: "#f97316", group: "validate" },
  remove_action: { title: "Desfazer", color: "#ef4444", group: "teach" },
  status: { title: "Status", color: "#64748b", group: "teach" },
};

function kindMeta(kind: string) {
  return (
    KIND_META[kind] ?? {
      title: kind,
      color: "#64748b",
      group: "other",
    }
  );
}

function parsePayload(raw?: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function payloadPreview(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload.slice(0, 160);
  if (typeof payload !== "object") return String(payload);
  const o = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.status === "string") parts.push(o.status);
  if (typeof o.openKind === "string") parts.push(`openKind=${o.openKind}`);
  if (typeof o.listingCount === "number") parts.push(`${o.listingCount} cards`);
  if (typeof o.teachPass === "number") parts.push(`pass ${o.teachPass}`);
  if (Array.isArray(o.flyers)) parts.push(`${o.flyers.length} encarte(s)`);
  if (Array.isArray(o.steps)) parts.push(`${o.steps.length} step(s)`);
  if (Array.isArray(o.selectors)) parts.push(o.selectors.slice(0, 2).join(", "));
  if (typeof o.url === "string") parts.push(o.url.slice(0, 80));
  if (parts.length) return parts.join(" · ");
  return JSON.stringify(o).slice(0, 120);
}

function PayloadBlock({ payload }: { payload: unknown }) {
  if (payload === null || payload === undefined) return null;
  const text =
    typeof payload === "string"
      ? payload
      : JSON.stringify(payload, null, 2);
  return (
    <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--ds-color-border)] bg-[var(--ds-color-muted)]/30 p-2 font-mono text-[11px] leading-relaxed text-[var(--ds-color-foreground)] whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  events: SetupTraceEvent[];
};

export function WorkerSetupTracePanel({ open, onClose, events }: Props) {
  const [filter, setFilter] = useState<"all" | "analyze" | "teach" | "persist">(
    "all",
  );
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setOpenId(null);
      setFilter("all");
    }
  }, [open]);

  const sorted = useMemo(
    () => [...events].sort((a, b) => a.order - b.order),
    [events],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return sorted;
    const groups: Record<string, string[]> = {
      analyze: ["locate", "analyze", "confirm_scope"],
      teach: [
        "session_start",
        "session_close",
        "navigation",
        "click",
        "input",
        "scroll",
        "scope",
        "remove_action",
      ],
      persist: ["save", "preview", "skip_flyer", "flow_created"],
    };
    const allow = new Set(groups[filter] ?? []);
    return sorted.filter((e) => allow.has(e.kind));
  }, [sorted, filter]);

  const sessions = useMemo(() => {
    const ids = new Set(
      sorted.map((e) => e.sessionId).filter(Boolean) as string[],
    );
    return ids.size;
  }, [sorted]);

  if (!open) return null;

  return (
    <div
      className="ds-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="ds-modal"
        style={{
          width: 720,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "min(85vh, 800px)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="setup-trace-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <h2
              id="setup-trace-title"
              className="text-[22px] font-semibold tracking-[-0.02em]"
            >
              Rastreio do setup
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--ds-color-muted-foreground)]">
              {sorted.length
                ? `${sorted.length} evento(s)${sessions ? ` · ${sessions} sessão(ões) de ensino` : ""}`
                : "Histórico de ensino e configuração deste worker"}
            </p>
          </div>
          <button
            type="button"
            className="ds-modal-x"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {sorted.length ? (
          <>
            <div className="mt-4 flex shrink-0 flex-wrap gap-1.5">
              {(
                [
                  ["all", "Tudo"],
                  ["analyze", "Análises"],
                  ["teach", "Cliques"],
                  ["persist", "Salvar/Teste"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    filter === id
                      ? "ds-btn ds-btn--primary text-xs !py-1 !px-2.5"
                      : "ds-btn ds-btn--outline text-xs !py-1 !px-2.5"
                  }
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <ol className="mt-4 -mx-1 min-h-0 flex-1 overflow-y-auto divide-y divide-[var(--ds-color-border)]">
              {filtered.map((ev) => {
                const meta = kindMeta(ev.kind);
                const payload = parsePayload(ev.payload);
                const hint = payloadPreview(payload);
                const expanded = openId === ev._id;
                return (
                  <li key={ev._id} className="px-1 py-3">
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 text-left"
                      onClick={() => setOpenId(expanded ? null : ev._id)}
                    >
                      <span
                        className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                        style={{ background: meta.color }}
                      >
                        {meta.title}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug">
                          {ev.label}
                        </span>
                        {hint ? (
                          <span className="mt-0.5 block font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
                            {hint}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-[11px] text-[var(--ds-color-muted-foreground)]">
                          {formatOpsStamp(ev.at)}
                          {ev.sessionId ? ` · ${ev.sessionId}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--ds-color-muted-foreground)]">
                        {expanded ? "▲" : "▼"}
                      </span>
                    </button>
                    {expanded ? <PayloadBlock payload={payload} /> : null}
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="mt-8 mb-4 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum evento registrado ainda. Crie ou reensine o worker para
            popular o histórico.
          </p>
        )}
      </div>
    </div>
  );
}
