import Link from "next/link";

type Step = 1 | 2 | 3 | 4;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Supermercado" },
  { n: 2, label: "Fontes" },
  { n: 3, label: "Fluxo" },
  { n: 4, label: "Executar" },
];

function stepHref(n: Step, supermarketId?: string, flowId?: string) {
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
    <nav aria-label="Fluxo de cadastro" className="ds-tabs">
      {STEPS.map(({ n, label }) => {
        const href = stepHref(n, supermarketId, flowId);
        const on = n === currentStep;
        const inner = `${n}. ${label}`;
        if (href && !on) {
          return (
            <Link key={n} href={href} className="ds-tab">
              {inner}
            </Link>
          );
        }
        return (
          <span key={n} className={`ds-tab ${on ? "ds-tab--on" : ""}`}>
            {inner}
          </span>
        );
      })}
    </nav>
  );
}
