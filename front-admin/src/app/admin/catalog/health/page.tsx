import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function HealthPage() { return <MigrationNotice title="Saúde do catálogo" body="O diagnóstico de matching está sendo consolidado sobre as tabelas Prisma. Produtos e ofertas já usam o novo backend." backHref="/admin/products" />; }
