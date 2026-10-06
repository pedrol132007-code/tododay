# Lançamento do piloto

Como colocar o Tododay em uso pela equipe, como reverter e onde fica cada coisa. Ordem de cima para
baixo; cada passo diz em qual projeto ele mexe. **Dev** = `tododay-dev` (`aakske…`), **prod** =
`tododay-prod` (`fgrdsc…`).

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Site | https://tododay-nu.vercel.app (Vercel, projeto `tododay`, deploy a cada merge no `master`) |
| Banco, Auth, Storage, Edge Functions | Supabase `tododay-prod`; o dev é `tododay-dev` |
| Migrations e Edge Functions | Workflow **Deploy do banco**: no merge, aplica no dev e depois no prod |
| Backup | Workflow **Backup do banco**, todo dia às 03:00 (`docs/BACKUP.md`) |
| Secrets do GitHub | Ambientes `dev` e `prod`: `SUPABASE_DB_URL` (Session pooler); `prod`: `BACKUP_AGE_KEY`; repositório: `SUPABASE_ACCESS_TOKEN` |
| Variáveis do site | Vercel → Settings → Environment Variables (Production → prod, Preview → dev) |
| E-mail | SMTP do Gmail `todoapp70@gmail.com`, configurado no Auth do prod; também recebe o "Enviar feedback" |
| Chave do backup | Gerenciador de senhas ("Tododay — chave do backup") |

## Antes de convidar a equipe

1. **Backup do estado atual (prod).** Actions → Backup do banco → Run workflow (ou
   `gh workflow run backup.yml`). Espere os dois jobs verdes.
2. **Limpar os dados de teste (prod), sem apagar a estrutura.**
   - Storage → bucket `attachments` → selecione tudo → Delete (o Supabase não deixa apagar
     arquivos por SQL).
   - SQL Editor do **tododay-prod**:

     ```sql
     begin;
     truncate public.activity, public.attachment_trash, public.card_attachment, public.card_label,
       public.card_status_history, public.checklist_item, public.card, public.label, public.list,
       public.board, public.team_invite, public.team_member, public.team, public.profile
       restart identity;
     delete from auth.users;
     commit;
     ```

   - Confira: `select count(*) from auth.users;` e `select count(*) from public.card;` dão 0.
3. **Auth (prod e dev).** Crie um token em supabase.com → Account → Access Tokens, salve em
   `supabase-token.txt` na Área de Trabalho (nunca cole em chat). Depois:
   `npm run auth:configurar -- prod` (mostra o que muda) e `npm run auth:configurar -- prod --aplicar`.
   O mesmo com `dev`. Fica: cadastro fechado no prod, links valendo 24 h, senha mínima de 8 e os
   e-mails de `supabase/templates/`. Confira que o `site_url` mostrado é o do site. Apague o
   arquivo do token e revogue o token no painel.
4. **Primeiro admin (prod).** `npm run admin:primeiro`: pede a URL e a service_role na hora (não
   grava nada), cria a equipe e convida o admin por e-mail. Se o e-mail não chegar, ele mostra um
   link de acesso; se o link chegar cortado no navegador ("Verify requires a verification type"),
   gere outro com `npm run admin:link`, que copia o link inteiro para a área de transferência. Não
   rode o `admin:primeiro` de novo: ele criaria outra equipe.
5. **Conferência.** `npm run check:prod` verde; entrar no site com o admin, criar o primeiro board
   (nasce com A fazer, Em andamento e Concluído) e ver o selo Beta.
6. **Release.** `gh release create v1.0.0-beta --title "v1.0.0-beta" --notes-file <trecho do CHANGELOG>`.

## Convidar a equipe

Tela **Equipe** → convidar por e-mail (a pessoa define a senha pelo link). O e-mail do Gmail costuma
cair no lixo eletrônico, inclusive na Benner: avise a pessoa, ou use **Gerar link de acesso** e
mande o link por outro canal. O link vale 24 h e só existe para quem nunca entrou.

## Se algo der errado

- **Site quebrado depois de um merge:** Vercel → Deployments → o último deploy bom → Promote to
  Production (volta na hora). Depois, um PR com `git revert` do merge.
- **Migration com problema:** nunca edite a migration aplicada; corrija com uma migration nova
  (o Deploy do banco aplica no merge). Dados perdidos: `docs/BACKUP.md`.
- **Pessoa sem acesso:** Equipe → reenviar convite ou Gerar link de acesso. Para tirar alguém sem
  apagar nada: desativar.
- **Supabase pausado** (7 dias sem uso no plano Free): painel → Restore project. Os dados ficam.
