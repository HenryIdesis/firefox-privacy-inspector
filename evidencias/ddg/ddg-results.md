# Resumo tabular dos testes DDG

Versão observada: Firefox 156.0. A tabela completa, com links para as capturas e explicação das divergências, está em [`docs/relatorio.md`](../../docs/relatorio.md).

| Teste | Esperado | Observado no plugin | Causa da divergência |
|---|---|---|---|
| Storage Blocking | 23 mecanismos armazenam; WebSQL e service worker cookieStore falham | IndexedDB detectado; local/session não; cookies via JS não | A página usa atribuição direta, não `setItem`; `document.cookie` não gera `Set-Cookie` |
| Fingerprinting | Datapoints de fingerprinting e uso de Canvas observáveis | 124 datapoints, 14 falhas; Canvas em `toDataURL` e `getImageData`; score 85 | As falhas pertencem aos exercícios; o hook de Canvas funcionou |
| Storage Partitioning | Storage isolado por origem/contexto | 20 passaram e WebSQL ficou `unsupported`; local/session/IndexedDB vistos | WebSQL não é suportado pelo navegador |
| Bounce Tracking | Identificador transportado entre navegações principais | Não detectado | O relatório reinicia em `main_frame`; a heurística cobre recursos da mesma navegação |
| Query Parameters | Valores dos quatro links observáveis | Score 100; quatro links conferidos | Sem divergência relevante |
| Request Blocking | Domínio na blocklist não responde às requisições interceptadas | 21 bloqueadas; `serviceworker-fetch` escapou | Limitação de `webRequest.onBeforeRequest` para requisições iniciadas dentro de Service Worker |
| JS objects in global scope (`js-leaks`) | Alterações globais detectáveis pela página | Score 100 e hijacking não detectado; o perfil mostra os hooks da extensão | A instrumentação é visível para a página, mas o detector não conta os próprios hooks como hijacking |
| Tracker Reporting — script | Tracker carregado via script | Score 99; 1 requisição, 1 domínio; `doubleclick.net` | Requisição de script de terceiro detectada |
| Tracker Reporting — surrogate | Tracker com surrogate | Score 89; 1 requisição, 1 domínio; `doubleclick.net` | Surrogate ainda gera requisição observável |
| Tracker Reporting — imagem | Tracker carregado via imagem | Score 99; 1 requisição, 1 domínio; `facebook.com` | Requisição de imagem de terceiro detectada |
| Tracker Reporting — document fragment | Tracker criado via fragmento | Score 99; 1 requisição, 1 domínio; `facebook.com` | Fragmento gerou requisição observável |
| Tracker Reporting — fetch | Tracker carregado via fetch | Score 99; 1 requisição, 1 domínio; `facebook.com` | `fetch` apareceu como `xmlhttprequest` no `webRequest` |
