import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function SupermarketPage() { return <MigrationNotice title="Rede e filiais" body="A listagem de redes já está no Postgres. A configuração detalhada será exposta pela API administrativa." backHref="/admin/supermarkets" />; }
