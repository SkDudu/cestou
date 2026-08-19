import Link from "next/link";

type Step = 1 | 2 | 3 | 4;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Supermercado" },
  { n: 2, label: "Fontes" },
  { n: 3, label: "Fluxo" },
  { n: 4, label: "Executar" },
];

function stepHref(
  n: Step,
  supermarketId?: string,
  flowId?: string,
): string | undefined {
  switch (n) {
    case 1:
      return "/admin/supermarkets";
    case 2:
      return supermarketId ? `/admin/supermarkets/${supermarketId}` : undefined;
    case 3:
      return supermarketId
        ? `/admin/scraper?supermarketId=${supermarketId}`
        : "/admin/scraper";
    case 4:
      return flowId ? `/admin/scraper/${flowId}` : undefined;
  }
}

export function SetupFlowNav({
  currentStep,
  supermarketId,
  flowId,
}: {
  currentStep: Step;
  supermarketId?: string;
  flowId?: string;
}) {
  return (
    <nav
      aria-label="Fluxo de cadastro"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs"
    >
      <span className="mr-1 font-semibold uppercase tracking-wide text-zinc-500">
        Cadastro
      </span>
      {STEPS.map(({ n, label }, i) => {
        const href = stepHref(n, supermarketId, flowId);
        const active = n === currentStep;
        const done = n < currentStep;

        return (
          <span key={n} className="flex items-center gap-2">
            {i > 0 ? <span className="text-zinc-700">→</span> : null}
            {href && !active ? (
              <Link
                href={href}
                className={`rounded-md px-2 py-1 hover:bg-zinc-800 ${
                  done ? "text-emerald-400" : "text-zinc-400"
                }`}
              >
                {n}. {label}
              </Link>
            ) : (
              <span
                className={`rounded-md px-2 py-1 ${
                  active
                    ? "bg-zinc-100 font-medium text-zinc-900"
                    : "text-zinc-600"
                }`}
              >
                {n}. {label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
