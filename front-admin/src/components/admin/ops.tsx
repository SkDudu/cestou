import type { ReactNode } from "react";

export function OpsHeader({
  crumb,
  title,
  subtitle,
  stamp,
  filter,
  filterTarget,
  filterCount,
  primary,
}: {
  crumb?: ReactNode;
  title: ReactNode;
  subtitle?: string;
  stamp?: string;
  filter?: ReactNode;
  filterTarget?: () => void;
  filterCount?: number;
  primary?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 pb-[22px]">
      <div>
        {crumb ? <div className="ds-crumb mb-1">{crumb}</div> : null}
        <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm leading-5 text-[var(--ds-color-muted-foreground)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 pt-1">
        {stamp ? (
          <span className="flex items-center gap-2 text-[13px] text-[var(--ds-color-muted-foreground)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ds-color-success)]" />
            {stamp}
          </span>
        ) : null}
        {filter ??
          (filterTarget ? (
            <button
              type="button"
              className="ds-btn ds-btn--outline"
              onClick={filterTarget}
            >
              <Funnel />
              Filtrar
              {filterCount ? (
                <span className="ds-filter-count">{filterCount}</span>
              ) : null}
            </button>
          ) : null)}
        {primary}
      </div>
    </header>
  );
}

export function OpsKpi({
  label,
  value,
  hint,
  foot,
  danger,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  foot?: ReactNode;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <article className="ds-card min-w-0 flex-1">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
          {label}
        </p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-color-muted)]">
          {icon ?? <Clock />}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <p
          className="ds-kpi-value"
          style={danger ? { color: "var(--ds-color-danger)" } : undefined}
        >
          {value}
        </p>
        {hint}
      </div>
      {foot ? (
        <p className="text-xs text-[var(--ds-color-muted-foreground)]">{foot}</p>
      ) : null}
    </article>
  );
}

export function OpsTabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (id: string) => void;
  items: { id: string; label: string; count: number; warn?: boolean }[];
}) {
  return (
    <div className="ds-tabs">
      {items.map((item) => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`ds-tab ${on ? "ds-tab--on" : ""} ${item.warn ? "ds-tab--warn" : ""}`}
            onClick={() => onChange(item.id)}
          >
            {item.label} · {item.count}
          </button>
        );
      })}
    </div>
  );
}

export function Funnel() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 3h10L8.2 7.6V11l-2.4 1.2V7.6L2 3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Clock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5v3.2l2 1.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function statusDot(kind: "running" | "queue" | "review" | "duplicate" | "fail" | "ok") {
  const map = {
    running: "var(--ds-color-success)",
    ok: "var(--ds-color-success)",
    queue: "var(--ds-color-harbor)",
    review: "var(--ds-color-buoy)",
    duplicate: "var(--ds-color-buoy)",
    fail: "var(--ds-color-danger)",
  };
  return map[kind];
}
