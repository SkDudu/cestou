const STEPS = [
  { n: 1, label: "Loja" },
  { n: 2, label: "Fonte" },
  { n: 3, label: "Chromium" },
  { n: 4, label: "Teste" },
  { n: 5, label: "Confirmar" },
] as const;

export function WorkerSetupStepper({ step }: { step: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="ds-setup-stepper">
      {STEPS.map((s, i) => {
        const done = s.n < step;
        const active = s.n === step;
        return (
          <div key={s.n} className="flex items-center gap-0">
            {i > 0 ? <div className="ds-setup-stepper-line" /> : null}
            <div className="flex shrink-0 items-center gap-2.5">
              <div
                className={
                  done
                    ? "ds-setup-step-dot ds-setup-step-dot--done"
                    : active
                      ? "ds-setup-step-dot ds-setup-step-dot--active"
                      : "ds-setup-step-dot"
                }
              >
                {done ? "✓" : s.n}
              </div>
              <span
                className={
                  active
                    ? "text-sm font-semibold text-[var(--ds-color-ink)]"
                    : "text-sm font-medium text-[var(--ds-color-muted-foreground)]"
                }
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
