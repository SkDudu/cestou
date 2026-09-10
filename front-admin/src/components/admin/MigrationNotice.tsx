import Link from "next/link";

export function MigrationNotice({ title, body, backHref = "/admin" }: { title: string; body: string; backHref?: string }) {
  return <section className="mx-auto max-w-2xl space-y-4 p-6"><p className="ds-label-caps">Postgres / Prisma</p><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-sm text-[var(--ds-color-muted-foreground)]">{body}</p><Link href={backHref} className="text-sm font-medium text-[var(--ds-color-primary)] hover:underline">Voltar ao painel</Link></section>;
}
