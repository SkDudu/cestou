const SETUP_STEPS = [
  { n: 1, label: "Disponibilidade" },
  { n: 2, label: "Fonte" },
  { n: 3, label: "Chromium" },
  { n: 4, label: "Teste" },
  { n: 5, label: "Confirmar" },
] as const;

const EDIT_STEPS = [
  { n: 1, label: "Chromium" },
  { n: 2, label: "Teste" },
] as const;

export type StepperStep = { n: number; label: string };

export function WorkerSetupStepper({
  step,
  steps = SETUP_STEPS,
}: {
  step: number;
  steps?: readonly StepperStep[];
}) {
  return (
    <nav className="ds-setup-stepper" aria-label="Progresso">
      {steps.map((s, i) => {
        const done = s.n < step;
        const active = s.n === step;
        const lineDone = s.n < step;
        const last = i === steps.length - 1;
        return (
          <div
            key={s.n}
            className={
              last
                ? "ds-setup-stepper-item ds-setup-stepper-item--last"
                : "ds-setup-stepper-item"
            }
          >
            <div className="ds-setup-stepper-node">
              <div
                className={
                  done
                    ? "ds-setup-step-dot ds-setup-step-dot--done"
                    : active
                      ? "ds-setup-step-dot ds-setup-step-dot--active"
                      : "ds-setup-step-dot"
                }
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M2.5 7.2 5.4 10.2 11.5 3.8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  s.n
                )}
              </div>
              <span
                className={
                  done || active
                    ? "ds-setup-step-label ds-setup-step-label--on"
                    : "ds-setup-step-label"
                }
              >
                {s.label}
              </span>
            </div>
            {!last ? (
              <div
                className={
                  lineDone
                    ? "ds-setup-stepper-line ds-setup-stepper-line--done"
                    : "ds-setup-stepper-line"
                }
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export { SETUP_STEPS, EDIT_STEPS };
