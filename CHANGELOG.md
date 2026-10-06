# Changelog

Mudanças relevantes do Tododay. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [v1.0.0-beta] — 2026-10-06

Primeira versão para uso real por uma equipe pequena (piloto).

### Board
- Boards por equipe, com colunas e cards. Os cards arrastam entre colunas e as colunas arrastam entre si. Também há "Mover para…", que escolhe coluna e posição sem arrastar.
- Colunas com tipo (a fazer, em andamento, concluído), contador e limite de WIP. Uma coluna pode ser recolhida numa faixa estreita, e isso fica lembrado por board.
- Cards com responsável, prazo, prioridade, etiquetas, checklist e descrição em Markdown. O selo de prazo e o aviso de card parado aparecem na própria face do card.
- Busca e filtros no board: texto, responsável (inclusive "Eu"), prioridade, etiqueta, prazo, paradas, tipo de coluna e ordenação. Tudo fica na URL. O atalho `/` leva à busca do board.
- Busca global (`Ctrl+K`) em todos os boards da equipe.
- Arquivamento, com Desfazer, restauração e exclusão definitiva. A coluna Concluído arquiva de uma vez o que está lá há mais de 7 dias.
- Board novo já nasce com as colunas A fazer, Em andamento e Feito.
- Atualização em tempo real: as mudanças dos colegas aparecem sem recarregar.
- Histórico de atividade por card e por equipe.

### Dashboard
- Visão da equipe e de cada pessoa: entregas, criadas × concluídas, lead time (percentil 85), backlog e entregas no prazo, com variação em relação ao período anterior.
- Período por atalhos ou intervalo personalizado. Cada gráfico tem uma frase de resumo.
- Cada número abre o board já filtrado com as mesmas tarefas, e há "Voltar ao dashboard".
- Nesta versão o dashboard ainda não mostra os dados da equipe: em produção ele explica o que vai aparecer ali, e a demonstração (dados gerados no navegador) existe só no ambiente de desenvolvimento. As métricas com dados reais vêm numa próxima versão; o histórico de status dos cards já é gravado desde agora.

### Alertas e carga da equipe
- Bloco **Atenção**: tarefas atrasadas, que vencem em breve, paradas e colunas acima do limite de WIP, gerados por regras com limites configuráveis num arquivo só.
- **Carga da equipe**: ordenada por risco (primeiro atrasadas, depois carga), sem formar ranking entre as pessoas.

### Anexos
- Enviar, ver e excluir arquivos no card, com limite de tamanho e de tipos conferido no servidor.
- No board, o card mostra o clipe com a contagem e a imagem de capa. Há aviso antes de excluir algo que tem anexos.
- Os arquivos ficam num bucket privado e só abrem por URL assinada, com validade.

### Equipes e convites
- Equipes com papéis `admin`, `member` e `viewer`, garantidos no banco por RLS. O `viewer` só lê. Cada membro tem um cargo. A estrutura do board (colunas e boards) é só do admin.
- O admin convida por e-mail; a pessoa define a própria senha pelo link (válido por 24 h). Para quem nunca entrou há "Gerar link de acesso", caso o e-mail caia no lixo eletrônico.
- Desativar um membro tira o acesso sem apagar nada.
- Cadastro público fechado: só entra quem foi convidado.
- Login por e-mail e senha, com "Esqueci minha senha".

### Geral
- Identidade visual da Benner, com tema claro, escuro ou do sistema e densidade normal ou compacta.
- Versão web (Vercel) e app desktop para Windows (Tauri).
- Selo **Beta** e **Enviar feedback** no menu, que abre um e-mail para o time do app.

### Segurança e operação
- Cabeçalhos de segurança (CSP, HSTS) no site e nada liberado para quem não entrou.
- Migrations e Edge Functions aplicadas pelo CI, primeiro no ambiente de desenvolvimento e depois em produção.
- Backup diário criptografado dos dados, com teste automático de restauração.

[v1.0.0-beta]: https://github.com/pedrol132007-code/tododay/releases/tag/v1.0.0-beta
