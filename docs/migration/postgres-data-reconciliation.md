# Reconciliação de dados PostgreSQL

O banco atual é a fonte de verdade. Não havia export histórico do Convex no workspace, portanto não existe uma carga histórica para reconciliar nesta branch.

Quando um export JSON for disponibilizado, a importação deve ocorrer em ambiente isolado, com relatório de contagem por entidade, órfãos, duplicatas e hashes de arquivos. O benchmark atual pode ser executado com `npm --prefix back run benchmark:api`; ele grava `back/reports/api-benchmark.json` com p50 e p95 das consultas operacionais.
