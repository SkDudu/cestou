import { MigrationNotice } from "@/components/admin/MigrationNotice";
export default function ErrorPage() { return <MigrationNotice title="Erro de extração" body="Os erros de processamento serão apresentados pela nova API de operações." backHref="/admin/extraction" />; }
