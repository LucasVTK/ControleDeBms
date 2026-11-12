# Backend — Controle de Produção BM

API REST em Node.js + Express + PostgreSQL. As fotos vão para o Supabase Storage (ou Cloudinary, como alternativa); no banco fica só a URL.

## Requisitos

- Node.js 18 ou superior
- PostgreSQL (local ou na nuvem: Supabase, Neon, Render...)
- Para as fotos em produção: Supabase Storage (mesma conta do banco). Sem storage configurado, as fotos ficam em `backend/uploads` (modo teste).

## Como rodar

```bash
cd backend
npm install
cp .env.example .env      # no Windows: copy .env.example .env
# edite o .env (veja abaixo)
npm run migrate           # cria as tabelas (pode rodar quantas vezes quiser)
npm run seed              # cria o admin definido no .env
npm run seed:membros      # (opcional) cria também membro1..membro5 com senhas aleatórias
npm run dev               # API em http://localhost:3001
```

O `seed:membros` mostra as senhas geradas **uma única vez** no terminal. Anote e passe para cada membro. Depois o admin pode trocar as senhas pela tela **Membros**.

## Variáveis do `.env`

| Variável | O que é |
|---|---|
| `DATABASE_URL` | String de conexão do Postgres. No Supabase: *Project Settings → Database → Connection string (URI)*. Troque `[YOUR-PASSWORD]` pela senha do banco. |
| `DATABASE_SSL` | `true` para Supabase/Neon/Render, `false` para Postgres local. |
| `JWT_SECRET` | String longa e aleatória (mín. 16 caracteres). Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `JWT_EXPIRES_IN` | Validade do login (padrão `7d`). |
| `CORS_ORIGIN` | URL(s) do front-end, separadas por vírgula. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Projeto do Supabase e a *Secret key* (`sb_secret_...`), para guardar as fotos. |
| `SUPABASE_BUCKET` | Bucket das fotos (padrão `fotos`, público). |
| `CLOUDINARY_*` | Opcional: alternativa ao Supabase Storage. |
| `MAX_IMAGE_MB` | Tamanho máximo por foto (padrão 10). |
| `ADMIN_NAME` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Usados só pelo `npm run seed`. |

> O `.env` está no `.gitignore`. Nunca suba senhas para o Git.

## Regras implementadas

- **Contagem**: só lançamentos `APROVADO` somam feitas e banidas.
- **Pagamentos**: `gerados = floor(feitas_aprovadas / 20)`, `pendentes = gerados − quitados`, `progresso = feitas % 20`.
- **Marcar como pago**: grava uma linha em `payments` com a quantidade quitada. Feitas e progresso não mudam. A operação trava a linha do membro, então dois cliques ao mesmo tempo não pagam em dobro.
- **Reavaliação**: o admin pode mudar a avaliação de um lançamento já avaliado, para corrigir um engano. Se isso reduzir as feitas abaixo do que já foi pago, os pendentes ficam em 0 (nunca negativos).
- **Avisos**: ao avaliar, o lançamento fica marcado como "não visto" para o membro até ele clicar em "Marcar como visto".
- **Desativar membro**: bloqueia o login na hora, mas os registros dele continuam guardados.

## Endpoints

Todas as rotas, exceto o login, exigem `Authorization: Bearer <token>`.

| Método | Rota | Quem | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | `{ username, password }` → `{ token, user }` |
| GET | `/api/auth/me` | logado | Usuário atual |
| GET | `/api/users/me/stats` | membro | Totais do próprio membro |
| GET | `/api/users` | admin | Membros com totais |
| POST | `/api/users` | admin | Cadastra membro `{ name, username, password }` |
| PATCH | `/api/users/:id` | admin | `{ name?, password?, active? }` |
| GET | `/api/entries` | logado | Membro: só os próprios. Admin: todos. Filtros `?user_id=&status=&page=&pageSize=&order=asc` |
| GET | `/api/entries/:id` | dono/admin | Um lançamento |
| POST | `/api/entries` | membro | multipart: `foto_antes`, `foto_depois`, `qty_done`, `qty_banned`, `description` |
| PATCH | `/api/entries/:id/review` | admin | `{ status: APROVADO\|REPROVADO, comment }` (comentário obrigatório ao reprovar) |
| GET | `/api/payments` | admin | Histórico de quitações (`?user_id=`) |
| POST | `/api/payments` | admin | `{ user_id }` → quita todos os pendentes |
| GET | `/api/notifications/count` | logado | Membro: avaliações não vistas. Admin: lançamentos pendentes |
| POST | `/api/notifications/read` | membro | Marca os avisos como vistos |

## Validações no servidor

- Quantidades: inteiros de 0 a 1.000.000.
- Fotos: as duas são obrigatórias. Aceita JPG, PNG e WEBP (HEIC só com Cloudinary), até `MAX_IMAGE_MB`. O servidor confere a assinatura binária do arquivo, não só a extensão.
- Se o upload de uma foto falhar ou o banco recusar o lançamento, as fotos já enviadas são apagadas do storage.
- Senhas guardadas com hash bcrypt (12 rounds). O login tem limite de 20 tentativas a cada 15 minutos por IP.

## Produção

`npm start` em qualquer host Node (Render, Railway, VPS...). Configure as mesmas variáveis do `.env` no painel do host, rode `npm run migrate` e `npm run seed` uma vez, e coloque a URL do front-end em `CORS_ORIGIN`.
