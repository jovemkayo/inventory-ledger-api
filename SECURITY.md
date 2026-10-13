# Segurança e escopo

Aplicação demonstrativa para execução local, com dados fictícios. O repositório contém código; não publica uma API de escrita na internet.

A página inicial e favicons locais são recursos públicos do projeto, sem dados de banco ou configuração interna. As rotas HTML, SVG, ICO e documentação mantêm a mesma verificação de Host/Origin das rotas da API.

- Servidor ligado exclusivamente a `127.0.0.1`, sem autenticação neste escopo.
- Não usar dados pessoais, credenciais ou registros de clientes.
- Não configurar proxy, túnel, CORS irrestrito ou deploy público.
- Consultas parametrizadas e transações de saldo/histórico.
- Corpos de requisição limitados a 16 KiB; entradas verificadas; mensagens HTTP internas sem stack, SQL ou caminhos locais.
- Bancos e arquivos de ambiente ficam fora do Git. O processo local e o arquivo do banco devem permanecer sob controle do usuário.
- Host e Origin não substituem autenticação. Aplicativos locais podem acessar ou modificar dados; o histórico não protege contra alteração direta do arquivo SQLite.

Para uma publicação de produção, seria necessário projetar autenticação, autorização, limites de uso, backups, observabilidade e uma revisão específica do ambiente. Este projeto não promete esses controles.

Antes de compartilhar uma falha publicamente, use o contato disponível no perfil do mantenedor no GitHub. Não inclua segredos ou dados pessoais em issues. Dependências podem mudar depois da revisão; execute `npm audit` e revise atualizações antes de incorporá-las.
