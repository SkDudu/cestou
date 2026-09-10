import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function NewScraperPage() { return <MigrationNotice title="Novo fluxo de scraper" body="Crie e execute fluxos pela API de scraper já conectada ao pg-boss. A interface de configuração detalhada será retomada sobre o novo modelo Prisma." backHref="/admin/scraper" />; }
