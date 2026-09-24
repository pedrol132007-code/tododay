# Identidade visual da Benner — resumo

Extraído em 24/09/2026 de benner.com.br (Home, Sobre, ERP Jurídico, Blog), com Playwright e o CSS do Webflow. Números completos em `design-tokens.json`; amostras visuais em `guia-de-marca.html`.

## Em uma frase

Tecnologia corporativa confiante: **azul elétrico `#2538FF` e vermelho `#E51E47`** sobre um fundo **creme `#F8F5F1`**, fonte geométrica em peso regular, botões retos em caixa alta e um degradê azul→vermelho com "onda" de luz como assinatura.

## Visual

- **Cores:** azul é a primária (única variável CSS: `--benner-blue`); vermelho é a cor da ação (todo CTA principal é vermelho). O laranja `#FBA747` aparece quase só no hover — todos os botões sólidos ficam laranja com texto preto ao passar o mouse. Neutros quentes: creme de fundo, `#333` no texto, grafite `#1A1E21` no rodapé.
- **Tipografia:** `mundial` (Adobe Fonts) em 400/600/700. Títulos grandes em **peso regular**, com letter-spacing negativo (−0.1rem) e linhas apertadas (0.9 no H1). Negrito fica para destaques pontuais e títulos em vermelho.
- **Botões:** caixa alta, raio 0.3rem (quase reto), padding 1rem × 2rem, sem sombra, transição 0.4s. Variantes: vermelho (principal), azul (menu), outline azul (secundário), branco (sobre azul).
- **Forma:** cantos quase retos por padrão; cards brancos com sombra `0 15px 15px rgba(0,0,0,.15)` sobre o creme.
- **Detalhes gráficos:** filetes horizontais curtos (vermelho ou azul) antes de títulos e nas margens; ícones de linha vermelhos; seta diagonal ↗ como convite para clicar; fotos de pessoas com camada de degradê azul/vermelho.
- **Escala:** tudo em `rem` com base fluida (≈12,5px em 1440px). Espaçamentos dominantes: 1rem e 2rem.

## Tom de voz

- **Para quem:** gestores e líderes de grandes empresas ("quem lidera", "grandes empresas no Brasil").
- **Postura:** confiante e institucional, sem gíria nem humor. Frases afirmativas e curtas, muitas terminando em ponto final mesmo em títulos ("Resultados que geram confiança.").
- **Temas recorrentes:** gestão, resultado, eficiência, inteligência, evolução, parceria, experiência ("Há 30 anos…", "Quase 30 anos de mercado"). IA e automação aparecem como meio, sempre com "governança e supervisão humana".
- **Estruturas típicas:** pares de ideias ("Tecnologia com propósito, gestão com resultado"; "Tecnologia é parte da resposta. Experiência em gestão também."), verbos de transformação ("transformar", "evoluir", "mover").
- **CTAs:** imperativo direto e cordial, em caixa alta: FALE COM UM ESPECIALISTA, SOLICITE UMA DEMONSTRAÇÃO, CONHEÇA, SAIBA MAIS.
- **Tratamento:** "você/sua empresa", próximo mas profissional.

## Pontos ambíguos (anotados em vez de chutados)

1. **Vermelho tem 4 variações:** `#E51E47` (botões, o mais usado), `#E51F4B` (títulos da página jurídica), `#E51F48` (ponto do logo e b-mark) e `#ED1846` (2 regras de CSS). Adotei `#E51E47` como oficial por frequência, mas o logo usa `#E51F48`.
2. **Azul também varia:** `#2538FF` (variável CSS e site) vs. `#2539FF` (dentro do b-mark.svg) — diferença imperceptível. `#005DFF` só aparece em landing pages específicas (classes `.lp-*`) e não parece ser da marca.
3. **Fonte licenciada:** `mundial` vem de um kit do Adobe Fonts (`use.typekit.net/hpw1rny.js`), que só funciona nos domínios autorizados. Usar em outro produto exige licença Adobe Fonts / kit próprio.
4. **Montserrat** é carregada em todas as páginas (via WebFont.load, todos os pesos), mas nenhum elemento visível a usa — provavelmente sobra de versão antiga. Serve como substituta livre, mas não é a fonte da marca.
5. **Lato** aparece só no banner de cookies (componente de terceiros).
6. **Tamanho do texto corrido não é único:** aparece em 1rem, 1.2rem e 1.5rem conforme a seção. Não há um "body" canônico no CSS (o `body` do Webflow ainda está com Arial 14px, sobrescrito por classes).
7. **H5/H6 não existem** nas páginas analisadas; o Webflow usa classes (`heading-6`) em tags `h4`.
8. **Degradê do hero é imagem**, não CSS — as cores intermediárias (magenta/roxo) no guia são aproximação visual.
9. **Logos:** a CDN só tem versões brancas do logotipo; não encontrei versão colorida/escura para fundo claro nas páginas analisadas.

## Como foi feito

- robots.txt permite tudo (`Allow: /`); nenhuma página com login.
- ≥1,2s entre cada carregamento de página e cada download (as sub-requisições que o navegador faz ao abrir uma página — imagens, CSS — seguem o ritmo normal do navegador).
- O banner de cookies foi **escondido via CSS** nas capturas, sem aceitar os cookies.
- Capturas: 1440×900 (desktop) e iPhone 13 (mobile), página inteira.
