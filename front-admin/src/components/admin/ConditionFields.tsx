"use client";

import {
  ELIGIBILITY_OPTIONS,
  type ConditionDraft,
} from "@/lib/eligibility";

const TYPES = ELIGIBILITY_OPTIONS.filter((o) => o.id !== "ALL_CUSTOMERS");

export function ConditionFields({
  value,
  onChange,
}: {
  value: ConditionDraft[];
  onChange: (next: ConditionDraft[]) => void;
}) {
  function patch(i: number, next: Partial<ConditionDraft>) {
    onChange(value.map((row, j) => (j === i ? { ...row, ...next } : row)));
  }

  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md border border-[var(--ds-color-border)] p-2"
        >
          <div className="flex gap-2">
            <select
              value={row.type}
              onChange={(e) =>
                patch(i, { type: e.target.value as ConditionDraft["type"] })
              }
              className="ds-search min-w-0 flex-1"
            >
              {TYPES.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ds-btn ds-btn--sm ds-btn--ghost shrink-0"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Remover
            </button>
          </div>
          <input
            value={row.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="Nome (ex.: Clube São Luiz)"
            className="ds-search w-full"
          />
          <input
            value={row.description}
            onChange={(e) => patch(i, { description: e.target.value })}
            placeholder="Particularidade (ex.: a partir de 3 un.)"
            className="ds-search w-full"
          />
        </div>
      ))}
      {value.length === 0 ? (
        <p className="text-xs text-[var(--ds-color-muted-foreground)]">
          Sem particularidade — preço vale para todos.
        </p>
      ) : null}
      <button
        type="button"
        className="ds-btn ds-btn--sm ds-btn--outline"
        onClick={() =>
          onChange([
            ...value,
            { type: "LOYALTY_PROGRAM", name: "", description: "" },
          ])
        }
      >
        Adicionar condição
      </button>
    </div>
  );
}
