# Fixtures São Luiz (opcional)

Pasta legada para JPEG manual. **Não é o fluxo do backend.**

Backend real = **PostgreSQL no Docker** + volume `storage-data`.  
Smoke correto:

```bash
cd back
npm run flyers:test-extraction -- --page=1
```

`expected.json` = formato alvo do schema de ofertas (referência).
