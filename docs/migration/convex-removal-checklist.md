# Checklist de remoção do Convex

- [x] Convex, tipos gerados, providers, scripts e dependências removidos.
- [x] Fastify, Prisma/PostgreSQL, pg-boss e SSE são o runtime de backend.
- [x] API e worker compartilham armazenamento local pelo Docker Compose.
- [x] Cliente e painel usam cookies HttpOnly e APIs REST.
- [x] `npm --prefix back run verify:no-convex` impede reintrodução de referências proibidas.
- [x] Testes integrados passam usando o PostgreSQL Docker local.

O inventário histórico permanece em `docs/convex-removal-inventory.md`. Para importar dados históricos, forneça um export JSON do ambiente antigo; nenhum dump Convex estava presente no repositório durante a migração.
