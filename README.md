# Inventory Ledger API

API de estoque em **TypeScript e Node.js**, com persistência **SQLite**, movimentações transacionais e histórico. Projeto independente de portfólio, com dados fictícios e execução local.

Uma saída maior que o saldo retorna **409**. Saldo e histórico são gravados na mesma transação: se a gravação falhar, ambos permanecem intactos. Quantidades usam inteiros em milésimos no banco para evitar erros acumulados como `0.3 - 0.1`.

## Executar

Requer **Node.js 24.19 ou superior na linha 24** e npm. Não há dependências externas de execução; TypeScript e os tipos do Node são dependências de desenvolvimento fixadas no lockfile.

```sh
npm ci
npm run seed    # opcional: cria três produtos fictícios numa base vazia
npm run dev
```

O servidor escuta em `http://127.0.0.1:3000`. Para executar a versão compilada:

Ao abrir esse endereço no navegador, a página inicial confirma que a API está ativa e oferece links para `/health`, `/products` e `/openapi.json`. O projeto tem favicon próprio. Os produtos continuam sendo consultados em JSON; a página inicial é orientação, sem uma interface de edição.

```sh
npm run build
npm start
```

Configurações opcionais: `PORT` (1–65535, padrão 3000) e `INVENTORY_DB_PATH` (padrão `data/inventory.sqlite`). Use variáveis de ambiente do seu terminal. Banco, dependências e arquivos compilados estão ignorados pelo Git. O seed recusa uma base populada e não apaga registros.

## Exemplo

Os exemplos abaixo usam curl; no PowerShell, use `curl.exe` ou `Invoke-RestMethod`.

```sh
curl -X POST http://127.0.0.1:3000/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"DEMO-01","name":"Example grain","unit":"kg","minimumStock":1}'
```

Copie o `id` retornado para `productId`:

```sh
curl -X POST http://127.0.0.1:3000/movements \
  -H 'Content-Type: application/json' \
  -d '{"productId":"UUID_RETORNADO","type":"in","quantity":2.5,"reason":"Fictional delivery"}'
```

Troque `type` para `out` para registrar consumo. Consulte `/products/UUID_RETORNADO` e `/products/UUID_RETORNADO/movements` para conferir saldo e histórico.

## Contrato

| Método | Rota | Resultado |
| --- | --- | --- |
| GET | `/health` | Disponibilidade |
| GET | `/products` | Catálogo paginado |
| GET | `/products/:id` | Produto e saldo |
| POST | `/products` | Produto com saldo inicial zero |
| POST | `/movements` | Entrada ou saída registrada |
| GET | `/products/:id/movements` | Histórico paginado |

Cadastro exige `sku`, `name`, `unit` e `minimumStock`. SKU único, normalizado para maiúsculas, até 40 caracteres alfanuméricos, hífen ou sublinhado. Nome de 1 a 120 caracteres. Unidades: `unit`, `kg`, `g`, `l`, `ml`. `unit` exige quantidades inteiras; as demais aceitam até três casas decimais. Cada movimento admite de 0.001 a 1.000.000, motivo de 1 a 240 caracteres e UUID v4 de produto. Estoque mínimo admite zero.

Listas recebem `limit` (1–100, padrão 50) e `offset` (inteiro não negativo, padrão 0), retornando `{ "items": [], "total": 0 }`. A ordem é a de inserção. Não há edição ou exclusão de movimentações pela API.

Erros retornam `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Insufficient stock." } }`.

| Status | Situação |
| --- | --- |
| 400 | Campo, JSON, ID ou quantidade inválida |
| 403 | Host ou origem não permitida |
| 404 | Produto ou rota ausente |
| 405 | Método não permitido |
| 409 | SKU duplicado ou saldo insuficiente |
| 413 | Corpo acima de 16 KiB |
| 415 | POST sem `application/json` |
| 500 | Falha interna, sem detalhes privados na resposta |

O saldo total de cada produto é limitado a 1.000.000.000, preservando a precisão de milésimos nas respostas numéricas. UUIDs recebidos em maiúsculas são normalizados; SKUs aceitam apenas o alfabeto ASCII indicado acima.

Contrato completo: [OpenAPI](docs/openapi.json).

## Organização

```text
HTTP → InventoryService → InventoryRepository → SQLite
              ↓                     ↓
       validação de domínio   transação saldo + histórico
```

- `src/domain`: contratos, erros e conversão de quantidades.
- `src/application`: validação e operações de negócio.
- `src/infrastructure`: schema, consultas parametrizadas e transações.
- `src/http`: contratos HTTP, limites de corpo, rotas e respostas.
- `tests`: regras, banco real temporário, rollback, persistência e chamadas HTTP.

Produtos armazenam SKU, unidade, saldo e mínimo. Movimentos referenciam produtos com foreign key e registram tipo, quantidade, motivo e data. `BEGIN IMMEDIATE` serializa alterações de estoque; o teste de duas saídas disputa um mesmo saldo e confirma que a operação rejeitada não gera histórico.

## Verificar

```sh
npm test
npm run typecheck
npm run build
npm audit
```

O GitHub Actions executa testes, tipos, compilação e auditoria de dependências a cada push e pull request.

## Limites

Este é um projeto local de demonstração, sem autenticação. Não o exponha por proxy, túnel ou rede pública. O processo usa SQLite síncrono e não foi dimensionado para grandes cargas. Restrições de Host e Origin ajudam a limitar requisições de navegador; programas locais ainda podem acessar a API. O proprietário do arquivo SQLite pode alterar seu conteúdo diretamente: histórico não equivale a trilha inviolável.

Não há ligação com bancos, marcas, usuários ou deploys de clientes. Melhorias em sistemas reais continuam nos repositórios privados. Veja [SECURITY.md](SECURITY.md).
