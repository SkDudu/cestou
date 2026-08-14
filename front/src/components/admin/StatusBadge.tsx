const styles: Record<string, string> = {
  validated: "bg-emerald-950 text-emerald-300 border-emerald-800",
  pending: "bg-zinc-800 text-zinc-300 border-zinc-700",
  suspicious: "bg-amber-950 text-amber-300 border-amber-800",
  rejected: "bg-rose-950 text-rose-300 border-rose-800",
  invalid: "bg-rose-950 text-rose-300 border-rose-800",
  discovered: "bg-sky-950 text-sky-300 border-sky-800",
  downloading: "bg-sky-950 text-sky-300 border-sky-800",
  downloaded: "bg-indigo-950 text-indigo-300 border-indigo-800",
  processing: "bg-violet-950 text-violet-300 border-violet-800",
  processed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  partially_processed: "bg-amber-950 text-amber-300 border-amber-800",
  expired: "bg-zinc-800 text-zinc-400 border-zinc-700",
  failed: "bg-rose-950 text-rose-300 border-rose-800",
  open: "bg-amber-950 text-amber-300 border-amber-800",
  resolved: "bg-zinc-800 text-zinc-400 border-zinc-700",
  active: "bg-emerald-950 text-emerald-300 border-emerald-800",
  inactive: "bg-zinc-800 text-zinc-400 border-zinc-700",
  out_of_scope: "bg-amber-950 text-amber-300 border-amber-800",
  unknown_city: "bg-violet-950 text-violet-300 border-violet-800",
  draft: "bg-zinc-800 text-zinc-300 border-zinc-700",
  testing: "bg-sky-950 text-sky-300 border-sky-800",
  disabled: "bg-zinc-800 text-zinc-500 border-zinc-700",
  error: "bg-rose-950 text-rose-300 border-rose-800",
  running: "bg-sky-950 text-sky-300 border-sky-800",
  success: "bg-emerald-950 text-emerald-300 border-emerald-800",
  partial: "bg-amber-950 text-amber-300 border-amber-800",
};

const labels: Record<string, string> = {
  validated: "Validado",
  pending: "Pendente",
  suspicious: "Suspeito",
  rejected: "Rejeitado",
  invalid: "Inválido",
  discovered: "Descoberto",
  downloading: "Baixando",
  downloaded: "Baixado",
  processing: "Processando",
  processed: "Processado",
  partially_processed: "Parcial",
  expired: "Expirado",
  failed: "Falhou",
  open: "Aberto",
  resolved: "Resolvido",
  active: "Ativo",
  inactive: "Rejeitado",
  out_of_scope: "Fora do escopo",
  unknown_city: "Cidade ?",
  draft: "Rascunho",
  testing: "Testando",
  disabled: "Desativado",
  error: "Erro",
  running: "Rodando",
  success: "Sucesso",
  partial: "Parcial",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
