# Testes no DDG

Firefox 156.0, plugin carregado, 27/09/2026. A versão foi conferida no `fingerprinting-results.json`.

Storage Blocking
Rodei em `privacy-test-pages.site/privacy-protections/storage-blocking/`. Deu 23 de 25. WebSQL e service worker cookieStore falharam, os dois esperados.

IndexedDB apareceu como usado no plugin. localStorage e sessionStorage não. Isso porque a página escreve com `localStorage.data = valor` em vez de `setItem`, e o hook sobrescreve o método. Não pega atribuição direta. Cookies têm o mesmo problema: a página grava via `document.cookie`, isso não passa pelo cabeçalho HTTP, então nosso contador não vê.

Fingerprinting
`/privacy-protections/fingerprinting/`. 124 datapoints coletados, 14 falhas. O plugin pegou canvas nos dois métodos, `toDataURL` e `getImageData`. Score 85, só a penalidade de canvas mesmo.

Esse foi o teste que fechou o canvas. Antes dele eu tinha tentado com o browserleaks.com e não detectava. O motivo era timing: o MAIN world entra depois do script inline da página.

Storage Partitioning
`www.first-party.site/privacy-protections/storage-partitioning/`. Domínio diferente de propósito. 21 passaram, WebSQL unsupported. O plugin viu localStorage com 2 chaves, sessionStorage com 1, IndexedDB com um banco `partition_test`. Bate com o que o DDG testou.

Bounce tracking
`/privacy-protections/bounce-tracking/`. Não pegou.

Clica num link, passa por `bad.third-party.site`, tenta ler um UID que ele mesmo gravou e passa adiante pela URL. Chega em `good.third-party.site` com `?bounceUIDlocalStorage=&bounceUIDcookie=&isNew=19`. O `isNew=19` quer dizer que o UID foi gerado novo, então o Firefox bloqueou a leitura. Bom pra privacidade, ruim pro teste.

O plugin não pega porque nosso detector de redirect só trabalha entre recursos da mesma página. Esse aqui é redirect entre navegações principais. Como o relatório zera a cada `main_frame`, a informação some antes de dar tempo de comparar.

Query Parameters
`/privacy-protections/query-parameters/`. Nada de terceiro, nada de fingerprint. Score 100. Cliquei nos 4 links, os valores bateram com o que a página esperava.

Request Blocking
`/privacy-protections/request-blocking/`. Adicionei `bad.third-party.site` pela página de opções. Rodou, deu 21 requisições bloqueadas.

Falhou quase tudo: script, style, img, iframe, WebSocket, fetch, XHR, sendBeacon, worker-fetch. `serviceworker-fetch` escapou, passou verde. O Firefox não intercepta de forma confiável requisição originada dentro de Service Worker. Não é bug nosso, é limite do `onBeforeRequest`.

JS objects in global scope
`/security/js-leaks.html`. É a js-leaks que o roteiro cita, mas com outro nome.

Popup deu Score 100, hijacking não detectado. Está certo, essa página não faz hijacking, só lê o `window` pra comparar com um Firefox de referência. Nosso detector não dispara.

Baixei o `profile.json` dela. Tem centenas de entradas em "Properties Added", mas quase tudo é diferença entre Firefox 156 e 92. O que interessa:

- `window.WebSocket` virou nosso `TrackingWebSocket`
- `window.localStorage.setItem` e `sessionStorage.setItem` têm o `post("storage-event")`
- `window.indexedDB.open` também

A extensão deixa pegada visível. É trade-off de qualquer extensão que instrumenta API de página. O DDG detecta essa instrumentação, que é o objetivo dele. Nosso plugin não reporta como hijacking porque ele não olha pra si mesmo, só pra sobrescrita que acontece depois dele.
