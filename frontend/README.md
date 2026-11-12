# Frontend — Controle de Produção BM

React (Vite) + React Router. Interface em português, feita primeiro para o celular.

## Como rodar

O backend precisa estar rodando antes (veja `../backend/README.md`).

```bash
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173. Em desenvolvimento, o Vite redireciona `/api` para `http://localhost:3001`, então não é preciso configurar nada.

### Testar pelo celular na mesma rede Wi-Fi

O `npm run dev` mostra um endereço **Network**, por exemplo `http://192.168.0.10:5173`. Abra esse endereço no navegador do celular. Se não abrir, libere a porta 5173 no firewall do Windows.

## Build de produção

```bash
cp .env.example .env    # no Windows: copy .env.example .env
# defina VITE_API_URL=https://sua-api.com (sem barra no final)
npm run build           # gera a pasta dist/
```

Publique a pasta `dist/` em qualquer host estático (Vercel, Netlify, Cloudflare Pages...). Como o app usa rotas do React Router, configure o host para mandar todas as rotas para `index.html`:

- **Netlify**: crie `public/_redirects` com `/* /index.html 200`
- **Vercel**: crie `vercel.json` com `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`

Lembre de colocar a URL do front-end em `CORS_ORIGIN` no backend.

## Telas

| Rota | Quem | Conteúdo |
|---|---|---|
| `/login` | todos | Login |
| `/membro` | membro | Card de totais (feitas aprovadas, banidas, pendentes, progresso x/20, pagamentos pendentes), formulário de novo lançamento e histórico com status e feedback |
| `/admin` | admin | Painel com todos os membros e o botão "Marcar como pago" (com confirmação) |
| `/admin/fila` | admin | Fila de pendentes, mais antigos primeiro, para aprovar ou reprovar com comentário |
| `/admin/lancamentos` | admin | Todos os lançamentos, com filtro por membro e por status (é possível reavaliar) |
| `/admin/pagamentos` | admin | Histórico de pagamentos quitados |
| `/admin/membros` | admin | Cadastro de membros, troca de senha, ativar e desativar |

As rotas são protegidas por tipo de usuário: um membro que tentar abrir `/admin` volta para `/membro`, e vice-versa.

## Detalhes

- **Fotos**: o botão abre a câmera ou a galeria do celular. Antes do envio, as fotos são reduzidas para no máximo 1920px, o que deixa o upload bem mais rápido no 4G. Toque numa foto do histórico para abrir em tamanho grande.
- **Avisos**: o sino no topo mostra, para o membro, quantos lançamentos foram avaliados e ainda não vistos (os cards ficam marcados como "Novo"). Para o admin, mostra quantos lançamentos aguardam avaliação. O contador atualiza a cada 30 segundos e sempre que o app volta para a tela.
- **Cores dos status**: amarelo = pendente, verde = aprovado, vermelho = reprovado.
- **Sessão**: o token fica no `localStorage`. Quando expira, o app volta para o login.
