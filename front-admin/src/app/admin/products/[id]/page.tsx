import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function ProductPage() { return <MigrationNotice title="Produto canônico" body="A visão detalhada será ligada ao histórico Prisma; a listagem de produtos já utiliza a nova API." backHref="/admin/products" />; }
