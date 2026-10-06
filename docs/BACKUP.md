# Backup do banco

Todo dia às 03:00 (Brasília) o workflow **Backup do banco** (`.github/workflows/backup.yml`) salva
os **dados** do prod (`tododay-prod`, schemas `public` e `auth`) criptografados com `age`, como
artifact da execução, por 90 dias. Logo depois, o job **Teste de restauração** carrega o backup num
Postgres descartável com as migrations e confere a contagem de cada tabela com o manifesto. Se algo
falhar, o GitHub manda e-mail.

Não entram: a estrutura (vem de `supabase/migrations/`), os arquivos dos anexos (bucket
`attachments`) e o dev.

## Chaves

- Pública: no topo do workflow (`AGE_RECIPIENT`). Só tranca.
- Privada: no gerenciador de senhas ("Tododay — chave do backup") e no secret `BACKUP_AGE_KEY`
  do ambiente `prod`. Sem ela, nenhum backup abre. Perdeu? Gere outro par (`age-keygen`), troque
  o secret e a pública; os backups antigos ficam ilegíveis.

## Recuperar

1. **Actions → Backup do banco →** a execução do dia escolhido **→ Artifacts**: baixe
   `tododay-prod-AAAA-MM-DD` e extraia o `.tar.age` do zip (ou `gh run download <id>`).
2. Descriptografe: `age -d -i chave.txt tododay-prod-AAAA-MM-DD.tar.age | tar -xf -` (sai
   `dados.sql` e `manifesto.txt`).
3. Teste antes no banco local: `supabase db start`, depois
   `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs`
   e `node scripts/backup-restaurar.mjs dados.sql manifesto.txt` com o mesmo `DATABASE_URL`.
4. No prod, à mão e com a equipe avisada:
   - **Projeto vivo, dados errados:** no SQL Editor, `truncate` das tabelas de `public` e
     `delete from auth.users` (sem apagar o schema); depois carregue `dados.sql` numa transação,
     com os triggers desligados:
     `psql "<URI do Session pooler>" -1 -c "set session_replication_role = replica" -f dados.sql`.
   - **Projeto perdido:** crie um projeto novo, rode `supabase/setup_producao.sql`, carregue o
     `dados.sql` como acima, troque o ref em `src/lib/environment.ts`, as variáveis da Vercel e os
     secrets do GitHub, e republique as Edge Functions (Deploy do banco).
5. Confira: `manifesto.txt` × contagens no SQL Editor, e `npm run check:prod`.
