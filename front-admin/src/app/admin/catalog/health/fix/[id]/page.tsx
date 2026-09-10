import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function FixPage() { return <MigrationNotice title="Correção de catálogo" body="As correções de matching serão aplicadas pela nova API administrativa." backHref="/admin/catalog/health" />; }
