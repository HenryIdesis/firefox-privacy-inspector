# Firefox Privacy Inspector

Extensão Firefox para observar rastreamento no lado do cliente. O projeto foi feito como trabalho da disciplina de Cibersegurança e mantém o código, a metodologia e as evidências no mesmo repositório.

## O que a extensão observa

- requisições e domínios de terceiros;
- cookies de primeira e terceira parte, separados entre sessão e persistentes;
- uso de `localStorage`, `sessionStorage` e `IndexedDB`;
- uso de Canvas e alguns sinais de fingerprinting;
- heurísticas de bounce/cookie sync;
- WebSocket de terceiros e sobrescrita de `fetch`, `XMLHttpRequest` e `eval`;
- score de 0 a 100 e blocklist configurável.

## Instalação no Firefox

1. Baixe ou clone este repositório.
2. Abra `about:debugging#/runtime/this-firefox`.
3. Clique em **Carregar extensão temporária** e selecione o arquivo `manifest.json` deste diretório.
4. Abra a página que será analisada, clique no ícone da extensão e use **Atualizar** para ler o relatório.
5. Para administrar a blocklist, abra **Opções** no menu da extensão.

Como a extensão é temporária, ela precisa ser carregada novamente quando o Firefox reiniciar. Não há etapa de build nem dependências externas: o arquivo `manifest.json` aponta diretamente para os arquivos em `src/`.

## Reproduzir as evidências

As capturas e os resultados do DuckDuckGo ficam em `evidencias/ddg/`. As capturas dos três sites reais ficam em `evidencias/blacklight/`, e os três arquivos HAR ficam em `evidencias/har/`. O relatório completo está em `docs/relatorio.md` e em PDF.

Para reproduzir um teste, carregue a extensão, abra a página do teste em uma aba nova, aguarde o carregamento, execute a ação indicada pelo próprio teste e clique em **Atualizar** no popup. O relatório é reiniciado quando a navegação principal muda.

## Limitações conhecidas

Os hooks de storage observam chamadas aos métodos `setItem` e `indexedDB.open`; atribuições diretas como `localStorage.chave = valor` não são interceptadas. Cookies definidos por JavaScript não passam pelo cabeçalho `Set-Cookie`. O detector de bounce observa redirects entre recursos da mesma navegação, mas não mantém estado entre navegações principais. As classificações de Canvas, hijacking e sincronização são heurísticas e devem ser lidas junto com o HAR e as ferramentas de comparação.

Mensagens que chegam do contexto da página são tratadas como telemetria não confiável e passam por uma allowlist. A leitura do relatório e a alteração da blocklist só são aceitas de páginas próprias da extensão.

## Verificação rápida

Os arquivos JavaScript podem ser verificados com `node --check src/background.js`, `node --check src/content.js` e `node --check src/inject.js`. A conferência funcional é feita no Firefox usando o fluxo de instalação acima e o checklist do relatório.
