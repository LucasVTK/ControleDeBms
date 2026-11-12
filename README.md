# Controle de Produção BM

App web para controlar a produção da equipe: lançamentos com fotos antes e depois, aprovação pelo admin e contagem de pagamentos (1 a cada 20 feitas aprovadas).

- [`backend/`](backend/README.md): API Node.js + Express + PostgreSQL + Cloudinary
- [`frontend/`](frontend/README.md): React + Vite
- `api/index.js` + `vercel.json` + `package.json` (raiz): publicação na Vercel

## Rodar localmente

```bash
# 1. Backend
cd backend
npm install
copy .env.example .env      # preencha DATABASE_URL, JWT_SECRET e ADMIN_PASSWORD
npm run migrate
npm run seed                # cria o admin (use seed:membros para criar também membro1..5)
npm run dev

# 2. Frontend (em outro terminal)
cd frontend
npm install
npm run dev                 # abre em http://localhost:5173
```

Sem as chaves do Cloudinary no `.env`, as fotos ficam salvas em `backend/uploads` (modo teste).

## Produção: Vercel + Supabase + Cloudinary

Front e API ficam no **mesmo projeto da Vercel**, com um único link. As telas são servidas como site estático (`frontend/dist`) e toda chamada a `/api/*` cai na função serverless `api/index.js`, que usa o mesmo Express do `backend/`.

### 1. Supabase (banco)

1. Crie um projeto em supabase.com.
2. Clique em **Connect** no topo e copie duas strings:
   - **Session pooler** (porta **5432**): usada para criar as tabelas a partir do seu PC.
   - **Transaction pooler** (porta **6543**): usada pela Vercel.
3. Na string, troque `[YOUR-PASSWORD]` pela senha do banco. Se a senha tiver caracteres especiais, codifique: `@` vira `%40`, `#` vira `%23`, `/` vira `%2F`, `:` vira `%3A`.

### 2. Criar as tabelas e o admin no Supabase (uma vez, do seu PC)

Crie `backend/.env.production` (já está no `.gitignore`):

```
DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-xx.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
ADMIN_NAME=Seu Nome
ADMIN_USERNAME=admin
ADMIN_PASSWORD=uma-senha-forte
```

Depois rode:

```bash
cd backend
node --env-file=.env.production src/db/migrate.js
node --env-file=.env.production src/db/seed.js
```

Os membros reais você cadastra pela tela **Membros**, depois de entrar como admin.

### 3. Cloudinary (fotos)

Crie uma conta grátis em cloudinary.com. No **Dashboard**, copie *Cloud name*, *API Key* e *API Secret*.

### 4. Vercel

1. Envie este repositório para o GitHub.
2. Em vercel.com: **Add New → Project** → importe o repositório. Deixe o *Root Directory* na raiz e não mude o *Framework* nem os comandos (o `vercel.json` já define tudo).
3. Em **Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| `DATABASE_URL` | string do **Transaction pooler** (porta 6543) |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | string aleatória longa (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CLOUDINARY_CLOUD_NAME` | do Cloudinary |
| `CLOUDINARY_API_KEY` | do Cloudinary |
| `CLOUDINARY_API_SECRET` | do Cloudinary |

4. Clique em **Deploy**. A cada `git push`, a Vercel publica de novo sozinha.

### Limites da Vercel que o app já trata

- **Upload:** a Vercel aceita no máximo 4,5 MB por envio. O app reduz as fotos no celular até as duas juntas ficarem abaixo de 4 MB.
- **Fotos:** na Vercel não há disco permanente, então lá o Cloudinary é obrigatório. Se faltar alguma chave, a API não sobe e o erro aparece nos logs da Vercel.
- **Banco:** a API roda em funções serverless e usa o pooler do Supabase (porta 6543), com poucas conexões por instância.
