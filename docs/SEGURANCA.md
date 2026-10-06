# Segurança do Tododay

Revisão feita para o piloto (v1.0.0-beta). Para conferir o banco a qualquer momento, rode `supabase/tests/auditoria_seguranca.sql` no SQL Editor. O resultado esperado é vazio.

## O que foi revisado

| # | Item | Como está |
|---|---|---|
| 1 | **HTTPS** | A Vercel só serve HTTPS (HTTP redireciona). O `Strict-Transport-Security` de 2 anos faz o navegador nem tentar HTTP. |
| 2 | **Cabeçalhos** | Em `vercel.json`. CSP sem script inline nem `eval`: só o script do tema, liberado por hash. Conexões só para o Supabase, fontes só do Google Fonts. Também `frame-ancestors 'none'` + `X-Frame-Options: DENY` (ninguém embute o app), `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `Cross-Origin-Opener-Policy`. `npm run test:e2e:csp` roda os testes de ponta a ponta contra o build com esses cabeçalhos. |
| 3 | **Login** | Supabase Auth limita as tentativas por IP: entrar, cadastrar e verificar código, cada um com um limite por 5 minutos (ajustável em *Authentication → Rate Limits*). A senha mínima é de 8 caracteres. Em produção o cadastro público é fechado: só entra quem foi convidado. |
| 4 | **Permissões no banco (RLS)** | Todas as tabelas têm RLS. Lê só quem é membro **ativo** da equipe. Membro escreve em cards, etiquetas, checklist e anexos. Viewer só lê. Estrutura (colunas, WIP, boards) e gestão da equipe são do admin. Desativado não vê nem edita nada. Cada migration tem um teste SQL que prova isso (`supabase/tests/`). |
| 5 | **Quem não está logado** | Nenhuma permissão no schema `public`, nem em tabelas e funções futuras (`0014`). |
| 6 | **Funções do banco** | As `security definer` têm `search_path` fixo. As RPCs do app rodam com a permissão de quem chama (`security invoker`), então a RLS vale. |
| 7 | **Anexos** | Bucket privado. Enviar: só quem edita o card (policy do Storage). Os metadados só são gravados pela Edge Function, depois de conferir tipo e tamanho pelo conteúdo do arquivo. Baixar: só por URL assinada de 5 minutos, gerada para quem pode ler o card. |
| 8 | **Edge Functions** | `attachments` e `members` conferem o token de quem chamou e o papel pelo próprio banco. A `service_role` só existe dentro delas, nunca no app nem no repositório. |
| 9 | **Convites** | Só admin ativo convida. O "Gerar link de acesso" só funciona para quem nunca entrou: um admin não consegue entrar na conta de quem já usa o app. |
| 10 | **Segredos** | gitleaks no histórico inteiro: nada encontrado. O frontend só tem a chave pública (anon). Os `.env*` são ignorados pelo git. |
| 11 | **XSS** | O React escapa todo texto. A descrição em Markdown não aceita HTML cru, e os links passam pelo filtro de URL do `react-markdown` (sem `javascript:`). |

## Riscos conhecidos (aceitos para o piloto)

1. **A sessão fica no `localStorage`, não num cookie `httpOnly`.** É o padrão do Supabase num site estático. Se alguém conseguisse rodar um script no app (XSS), poderia ler o token. Mitigação: a CSP estrita e o Markdown sem HTML. Cookie `httpOnly` exigiria um servidor próprio na frente do Supabase. O app não usa cookies, então "cookie seguro" não se aplica.
2. **Sem CAPTCHA no login.** Os limites são por IP: um ataque de senha vindo de muitos IPs não seria barrado. Mitigação: cadastro fechado e senha de 8 ou mais caracteres. Dá para ligar o Cloudflare Turnstile, que é grátis, em *Authentication → Attack Protection*.
3. **URL assinada de anexo** abre para quem tiver o link, até ele expirar (5 minutos).
4. **Edge Functions com CORS `*`.** Elas não usam cookie: quem chama precisa mandar um token válido, então outro site não age em nome do usuário.
5. **App desktop (Tauri) sem CSP** (`csp: null` em `src-tauri/tauri.conf.json`). Ele carrega só o próprio frontend, empacotado.
6. **E-mail pelo Gmail.** Limite de ~500 por dia, e pode cair no lixo eletrônico (a Benner faz isso). O "Gerar link de acesso" cobre o convite.
7. **Repositório público.** Nenhum segredo nele. A segurança não depende do código ser secreto.
8. **Supabase Free.** Pausa depois de 7 dias sem uso e não tem backup nativo. Backup diário criptografado pelo GitHub Actions, com teste de restauração: `docs/BACKUP.md`.
9. **Quem é desativado** continua com a conta: consegue entrar, mas só vê "Você ainda não está em nenhuma equipe".
