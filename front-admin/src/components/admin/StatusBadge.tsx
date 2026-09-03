const pills: Record<string, { className: string; label: string }> = {
  running: { className: "ds-pill ds-pill--running", label: "Rodando" },
  success: { className: "ds-pill ds-pill--running", label: "Publicado" },
  processed: { className: "ds-pill ds-pill--running", label: "Publicado" },
  validated: { className: "ds-pill ds-pill--running", label: "Ativa" },
  active: { className: "ds-pill ds-pill--queue", label: "Ativa" },
  downloading: { className: "ds-pill ds-pill--queue", label: "Em extração" },
  downloaded: { className: "ds-pill ds-pill--queue", label: "Em extração" },
  processing: { className: "ds-pill ds-pill--queue", label: "Em extração" },
  discovered: { className: "ds-pill ds-pill--queue", label: "Fila" },
  pending: { className: "ds-pill ds-pill--queue", label: "Fila" },
  ai_validated: { className: "ds-pill ds-pill--running", label: "IA ok" },
  review_required: { className: "ds-pill ds-pill--review", label: "Revisar condição" },
  human_validated: { className: "ds-pill ds-pill--running", label: "Humano" },
  fila: { className: "ds-pill ds-pill--queue", label: "Fila" },
  draft: { className: "ds-pill ds-pill--queue", label: "Fila" },
  testing: { className: "ds-pill ds-pill--review", label: "Revisão" },
  review: { className: "ds-pill ds-pill--review", label: "Revisão" },
  suspicious: { className: "ds-pill ds-pill--review", label: "Revisão" },
  partially_processed: { className: "ds-pill ds-pill--review", label: "Revisão" },
  partial: { className: "ds-pill ds-pill--review", label: "Revisão" },
  open: { className: "ds-pill ds-pill--review", label: "Aberto" },
  blocked: { className: "ds-pill ds-pill--fail", label: "Bloqueado" },
  failed: { className: "ds-pill ds-pill--fail", label: "Falha" },
  done: { className: "ds-pill ds-pill--running", label: "Ok" },
  error: { className: "ds-pill ds-pill--fail", label: "Falha" },
  rejected: { className: "ds-pill ds-pill--fail", label: "Expirada" },
  invalid: { className: "ds-pill ds-pill--fail", label: "Falha" },
  expired: { className: "ds-pill ds-pill--fail", label: "Expirado" },
  duplicate: { className: "ds-pill ds-pill--review", label: "Duplicata" },
  cancelled: { className: "ds-pill ds-pill--queue", label: "Parado" },
  disabled: { className: "ds-pill ds-pill--queue", label: "Pausada" },
  inactive: { className: "ds-pill ds-pill--queue", label: "Pausada" },
  not_configured: { className: "ds-pill ds-pill--review", label: "Não config." },
  resolved: { className: "ds-pill ds-pill--queue", label: "Resolvido" },
};

export function StatusBadge({ status }: { status: string }) {
  const item = pills[status] ?? {
    className: "ds-pill ds-pill--queue",
    label: status,
  };
  return <span className={item.className}>{item.label}</span>;
}
