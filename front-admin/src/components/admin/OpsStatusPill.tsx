export function OpsStatusPill({
  status,
}: {
  status: "running" | "ok" | "queue" | "review" | "duplicate" | "fail";
}) {
  const map = {
    running: { className: "ds-pill ds-pill--running", label: "Rodando" },
    ok: { className: "ds-pill ds-pill--running", label: "Ativo" },
    queue: { className: "ds-pill ds-pill--queue", label: "Fila" },
    review: { className: "ds-pill ds-pill--review", label: "Revisão" },
    duplicate: { className: "ds-pill ds-pill--review", label: "Duplicado" },
    fail: { className: "ds-pill ds-pill--fail", label: "Falha" },
  } as const;
  const item = map[status];
  return <span className={item.className}>{item.label}</span>;
}
