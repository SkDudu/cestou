import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function ExtractionRunPage() { return <MigrationNotice title="Revisão de extração" body="Acompanhe as execuções na tela do scraper com eventos SSE. A revisão detalhada será persistida no Postgres." backHref="/admin/scraper" />; }
