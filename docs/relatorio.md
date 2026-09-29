# Detecção de rastreamento no Firefox

**Avaliação Intermediária de Cibersegurança**  
**Prof. João Eduardo Luisi**  
**Autor: Henry Idesis**

## Resumo

Uma extensão para Firefox que detecta rastreamento no lado do cliente. O repositório é `github.com/HenryIdesis/firefox-privacy-inspector`. O histórico local atual tem seis commits incrementais, concentrados na estrutura inicial, detecção de terceiros, cookies e storage, Canvas/bounce/hijacking, score e blocklist.

O plugin detecta requisições para domínios de terceira parte, separa cookies de primeira e terceira parte entre sessão e persistentes, acompanha `localStorage`, `sessionStorage` e `IndexedDB`, identifica uso de Canvas, aplica heurísticas de bounce/cookie sync, sinaliza WebSocket de terceiros e sobrescrita de globais, calcula um score de 0 a 100 e permite uma blocklist própria.

As mensagens recebidas do contexto da página são tratadas como telemetria não confiável e passam por uma allowlist. A leitura do relatório e a alteração da blocklist só são aceitas por páginas próprias da extensão. Essa separação é importante porque uma página analisada não deve conseguir enviar comandos administrativos para o background.

## Instalação e reprodução

1. Abrir `about:debugging#/runtime/this-firefox` no Firefox.
2. Clicar em **Carregar extensão temporária**.
3. Selecionar o `manifest.json` do repositório.
4. Abrir a página que será analisada, clicar no ícone da extensão e usar **Atualizar**.
5. Abrir **Opções** para consultar ou alterar a blocklist.

Não há build nem dependências externas. O README contém o passo a passo e a verificação rápida com `node --check`.

## O que construí e como mede

A base veio das aulas. A parte de interceptar requisição e entender terceiros se relaciona à Aula 03, que trata de processos se comunicando pela rede. A parte de reconhecer o que a página carrega se relaciona à Aula 05, quando o professor mostra o Wappalyzer lendo framework e analytics pelo que a página puxa. A metodologia de separar coletar, processar, analisar e relatar veio da Aula 06. O score com pesos e categorias segue a ideia de CVSS apresentada na Aula 05.

**Terceiros.** Uso o campo `thirdParty` que o Firefox entrega no `webRequest`. O domínio-base trata alguns sufixos de dois níveis, como `com.br` e `co.uk`, para não classificar subdomínios do mesmo site como terceiros por engano.

**Cookies.** Leio `Set-Cookie` em `onHeadersReceived`. Persistente é o cookie com `Expires` válido no futuro ou `Max-Age` positivo; sessão é o restante. `Max-Age=0` e `Expires` passado são tratados como remoção e não entram na contagem. Uma data `Expires` inválida também não é presumida como persistente.

**Storage.** Intercepto `Storage.prototype.setItem` e `indexedDB.open` no contexto da página com `world: "MAIN"`. Funciona quando a página chama o método diretamente. Não funciona com atribuição direta, como `localStorage.chave = valor`.

**Canvas.** Há hooks em `toDataURL`, `toBlob` e `getImageData`, além de `OffscreenCanvas` quando disponível.

**Bounce/cookie sync.** Uma heurística olha redirect entre terceiros no `onBeforeRedirect`; outra procura na URL um parâmetro com valor codificado com pelo menos 40 caracteres.

**Hijacking.** São observados WebSocket para domínio de terceiro e sobrescrita de `fetch`, `XMLHttpRequest` ou `eval`. Esses sinais são heurísticos: uso legítimo de um SDK também pode produzir um alerta.

**Score.** A base é 100 e cada categoria tem uma penalidade com teto. Assim, uma dimensão não zera sozinha o resultado inteiro.

## Testes do DuckDuckGo Privacy Test Pages

Os testes foram executados em 27 de setembro de 2026 no Firefox 156.0, versão confirmada no `fingerprinting-results.json`. A tabela abaixo registra o resultado observado, a divergência em relação ao esperado e a evidência correspondente. O arquivo `storage-blocking-results.json` contém 54 linhas detalhadas porque inclui variantes de iframe; a comparação `23/25` é o resumo da página principal.

| Teste | Esperado pela página | Resultado do plugin | Divergência explicada | Evidência |
|---|---|---|---|---|
| Storage Blocking | Os mecanismos que conseguem gravar devem retornar; WebSQL e `service worker cookieStore` podem falhar | 23 de 25 gravaram; plugin viu IndexedDB, mas não local/session | A página usa atribuição direta para local/session, fora do hook `setItem`; cookie via JavaScript não passa por `Set-Cookie` | [captura](../evidencias/ddg/Captura%20de%20tela%202026-09-27%20123150.png), [JSON](../evidencias/ddg/storage-blocking-results.json) |
| Fingerprinting | Exercícios de fingerprinting devem produzir datapoints; Canvas é um sinal observável | 124 datapoints, 14 falhas; Canvas detectado em `toDataURL` e `getImageData`; score 85 | As falhas são do próprio exercício e não impedem o hook de Canvas; o score também considera outras categorias | [captura](../evidencias/ddg/image.png), [JSON](../evidencias/ddg/fingerprinting-results.json) |
| Storage Partitioning | O storage deve ficar particionado por origem/contexto | 20 mecanismos passaram e 1 ficou `unsupported` (WebSQL); 2 chaves local, 1 session e banco `partition_test` | WebSQL não é suportado pelo navegador; não é uma falha do particionamento observado | [captura](../evidencias/ddg/Captura%20de%20tela%202026-09-27%20123852.png), [JSON](../evidencias/ddg/storage-partitioning-results.json) |
| Bounce Tracking | O teste tenta transportar um identificador entre navegações principais | Não detectado; a página registrou `isNew=19` | O estado é reiniciado em `main_frame`; o detector observa redirects entre recursos da mesma navegação e não persiste cadeia entre páginas principais | [captura](../evidencias/ddg/Captura%20de%20tela%202026-09-27%20124636.png) |
| Query Parameters | Os valores adicionados aos links devem ser observáveis na navegação | Score 100; quatro links testados | Não houve divergência relevante | [captura](../evidencias/ddg/Captura%20de%20tela%202026-09-27%20124916.png) |
| Request Blocking | Um domínio colocado na blocklist não deve responder a requisições interceptadas | 21 requisições bloqueadas; `serviceworker-fetch` escapou | `webRequest.onBeforeRequest` não intercepta de forma confiável requisições iniciadas dentro de Service Worker | [captura](../evidencias/ddg/Captura%20de%20tela%202026-09-27%20125559.png) |
| JS objects in global scope (`js-leaks`) | A página deve identificar alterações nos objetos globais | Score 100 e hijacking não detectado | O `profile.json` identifica os hooks legítimos da extensão; o detector não se autoacusa. Isso é uma limitação conhecida da estratégia, não ausência de instrumentação | [captura](../evidencias/ddg/Captura%20de%20tela%202026-09-27%20130027.png), [perfil](../evidencias/ddg/profile%281%29.json) |
| Tracker Reporting — script | A página deve carregar um tracker principal via script | Score 99; 1 requisição, 1 domínio e 0 bloqueios; `doubleclick.net` detectado como script | O plugin identificou a requisição de terceiro e a classificação de tracking informada pelo Firefox | [captura](../evidencias/ddg/tracker-reporting-script.png) |
| Tracker Reporting — surrogate | A página deve carregar um tracker com surrogate | Score 89; 1 requisição, 1 domínio e 0 bloqueios; `doubleclick.net` detectado como script | O surrogate ainda aparece como requisição de terceiro observável; a diferença de score vem da classificação/categorias contabilizadas pelo plugin | [captura](../evidencias/ddg/tracker-reporting-surrogate.png) |
| Tracker Reporting — imagem | A página deve carregar um tracker via imagem | Score 99; 1 requisição, 1 domínio e 0 bloqueios; `facebook.com` detectado como imagem | O carregamento por imagem foi observado no `webRequest` e classificado pelo Firefox como tracking social | [captura](../evidencias/ddg/tracker-reporting-img.png) |
| Tracker Reporting — document fragment | A página deve criar um tracker via document fragment | Score 99; 1 requisição, 1 domínio e 0 bloqueios; `facebook.com` detectado como imagem | O tracker criado pelo fragmento gerou uma requisição observável ao domínio de terceiro | [captura](../evidencias/ddg/tracker-reporting-fragment.png) |
| Tracker Reporting — fetch | A página deve carregar um tracker via `fetch` | Score 99; 1 requisição, 1 domínio e 0 bloqueios; `facebook.com` detectado como `xmlhttprequest` | A requisição iniciada por `fetch` apareceu no `webRequest` como `xmlhttprequest`; a própria página informa que o tracker foi carregado | [captura](../evidencias/ddg/tracker-reporting-fetch.png) |

### Leitura dos resultados do DDG

O teste de Storage Blocking validou a diferença entre medir o cabeçalho de cookie e observar a API de storage. A página consegue gravar por caminhos que o plugin deliberadamente não intercepta. O teste de Storage Partitioning confirmou o isolamento observado pelo próprio exercício, com a única condição de WebSQL não suportado.

O teste de bounce não invalida a heurística: ele expõe uma lacuna de escopo entre recursos da mesma página e navegações principais. A extensão reinicia o relatório quando muda o `main_frame`, portanto não finge detectar uma cadeia que não acompanha.

O Tracker Reporting foi executado nos cinco subtestes. O plugin detectou uma requisição de terceiro em cada caso. Script, imagem, document fragment e fetch produziram score 99; o surrogate produziu score 89. As diferenças de domínio e tipo de recurso aparecem diretamente no popup e foram registradas na tabela.

No teste de JS leaks, o perfil confirma que a página enxerga mudanças feitas pela extensão. A extensão evita contar os próprios hooks como hijacking, mas isso significa que a página pode detectar a presença da instrumentação. Essa decisão reduz falso positivo no relatório principal e deve ser lida como limitação do detector.

## Três sites reais

Os sites foram `worldsurfleague.com`, `www.apple.com/br/` e `www.ralphlauren.pt/`. Os números do popup são a leitura da extensão; os números do HAR podem diferir porque o arquivo exportado inclui uma janela de captura e redirects diferentes.

| Site | Popup da extensão | Blacklight | uBlock Origin | Evidências |
|---|---|---|---|---|
| World Surf League | Score 20; 216 requisições; 58 domínios; 24 cookies persistentes de terceira parte; 23 ocorrências de bounce | 12 ad trackers; 2 cookies de terceiros | 13 bloqueios; 14/22 domínios | [plugin 1](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20130920.png), [plugin 2](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20130937.png), [Blacklight](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20131811.png), [uBlock](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20132132.png), [HAR](../evidencias/har/www.worldsurfleague.com_Archive%20%5B26-09-27%2013-08-48%5D.har) |
| Apple | Score 92; zero terceiros, cookies de terceira parte, bounce e hijacking; 6 chaves local e 3 session | Limpo, sem ad trackers/cookies de terceiro | 0 bloqueios | [plugin](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20132354.png), [Blacklight](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20132637.png), [uBlock](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20132801.png), [HAR](../evidencias/har/www.apple.com_Archive%20%5B26-09-27%2013-22-48%5D.har) |
| Ralph Lauren | Score 3; 122 requisições; 29 domínios; Canvas, bounce e sobrescrita de `fetch` | 0 ad trackers e 0 cookies de terceiro, mas positivo para trackers que evitam bloqueadores de cookies | 63 bloqueios; 18/27 domínios | [plugin 1](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20132949.png), [plugin 2](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20133000.png), [Blacklight](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20133133.png), [uBlock](../evidencias/blacklight/Captura%20de%20tela%202026-09-27%20133309.png), [HAR](../evidencias/har/www.ralphlauren.pt_Archive%20%5B26-09-27%2013-29-33%5D.har) |

### Reconciliação com os HARs

| Site | HAR | Leitura | Reconciliação |
|---|---:|---:|---|
| Apple | 33 entradas, 2 hosts, 1 `Set-Cookie`, 0 redirects | 0 entradas de terceiro usando `apple.com` como base | Compatível com o popup; o segundo host é subdomínio/serviço da mesma base e não foi contado como terceiro |
| World Surf League | 235 entradas, 60 hosts, 50 `Set-Cookie`, 19 redirects; 234 entradas e 59 hosts fora da base | Popup: 216 requisições e 58 domínios | O HAR exportado contém redirects e uma janela de captura diferente; não é correto somar esses números como se fossem a mesma amostra |
| Ralph Lauren | 192 entradas, 29 hosts, 38 `Set-Cookie`, 0 redirects; 97 entradas e 28 hosts fora da base | Popup: 122 requisições e 29 domínios | O popup e o HAR foram capturados em momentos diferentes; o HAR confirma a presença de terceiros, mas não deve ser usado para substituir o contador do popup |

No WSL aparecem `googlesyndication`, `doubleclick`, `scorecardresearch` e `ps.eyeota`. O IndexedDB contém `blaze-store`, `Braze IndexedDB Support Test` e `AppboyServiceWorkerAsyncStorage`, compatíveis com a presença da plataforma Braze. A diferença para o Blacklight não é erro: a extensão conta domínios externos, enquanto o Blacklight classifica trackers segundo a própria lista.

No Apple, as três ferramentas concordam em um cenário praticamente limpo. No Ralph Lauren, Blacklight não classificou ad trackers/cookies, mas indicou evasão de bloqueadores; isso é coerente com a extensão ter encontrado terceiros, Canvas e uma sobrescrita de `fetch`. O uBlock conta regras bloqueadas, não o mesmo conceito de tracker.

## Metodologia do score

| Critério | Penalidade | Unidade | Teto |
|---|---:|---|---:|
| Domínio de terceira parte | −1 | por domínio | −25 |
| Requisição de terceira parte | −0,2 | por requisição | −15 |
| Cookie 3ª parte persistente | −2 | por cookie | −15 |
| Cookie 3ª parte de sessão | −0,5 | por cookie | −5 |
| Cookie 1ª parte persistente | −0,2 | por cookie | −3 |
| `localStorage` | −5 | uma vez | −5 |
| `sessionStorage` | −3 | uma vez | −3 |
| `IndexedDB` | −5 | uma vez | −5 |
| Canvas fingerprint | −15 | uma vez | −15 |
| Bounce/cookie sync | −10 | uma vez | −10 |
| Hijacking | −20 | uma vez | −20 |

Faixas: 80–100 **Boa**, 50–79 **Moderada**, 0–49 **Ruim**. Aplicação final: Apple 92, World Surf League 20 e Ralph Lauren 3.

Hijacking pesa 20 porque sugere controle ou alteração da superfície do navegador, e não apenas coleta. Canvas pesa 15 por identificar o dispositivo sem depender de cookie. Cookie persistente de terceiro pesa mais que cookie de sessão porque atravessa sessões. Domínios e requisições de terceiros têm peso menor porque recursos externos também aparecem em páginas legítimas.

## O que o plugin não pega

Cookie via JavaScript não aparece no contador de cabeçalho. Storage por atribuição direta não passa pelo hook de `setItem`. Bounce entre navegações principais perde estado porque o relatório é reiniciado em `main_frame`. O domínio-base usa uma lista manual de sufixos e pode exigir extensão para TLDs públicos não incluídos. Canvas, hijacking e cookie sync são heurísticas: devem ser comparados com o HAR e com outras ferramentas.

Nenhuma dessas limitações foi escondida; cada uma aparece no resultado correspondente. As capturas e os HARs estão no repositório.

## Checklist de entrega

- [x] `manifest.json` instalável.
- [x] instruções de instalação e reprodução no `README.md`.
- [x] relatório em Markdown e PDF.
- [x] tabela DDG com divergências e links para as evidências disponíveis.
- [x] três sites reais, três HARs, capturas do plugin, Blacklight e uBlock.
- [x] score aplicado aos três sites e reconciliação dos contadores.
- [x] correção do canal de mensagens para impedir comandos administrativos vindos da página.
- [x] capturar os cinco subtestes da página **Tracker Reporting** e acrescentar os prints na tabela DDG.

## Fechando

O plugin detecta, classifica, mostra e bloqueia. Os testes realizados validam os caminhos principais, e os três sites mostram cenários bem diferentes. O código original, a metodologia e a autoria foram preservados; as mudanças feitas para a entrega são correções localizadas de segurança, precisão documental e empacotamento das evidências.
