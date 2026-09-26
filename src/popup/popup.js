"use strict";

var pageHostEl = document.getElementById("pageHost");
var reqCountEl = document.getElementById("requestCount");
var domCountEl = document.getElementById("domainCount");
var blockedCountEl = document.getElementById("blockedCount");
var domainsEl = document.getElementById("domains");
var errorEl = document.getElementById("errorMessage");
var refreshBtn = document.getElementById("refreshButton");
var openOptionsLink = document.getElementById("openOptions");

var c1s = document.getElementById("cookiesFirstSession");
var c1p = document.getElementById("cookiesFirstPersistent");
var c3s = document.getElementById("cookiesThirdSession");
var c3p = document.getElementById("cookiesThirdPersistent");

var stLocal = document.getElementById("storageLocal");
var stSession = document.getElementById("storageSession");
var stIDB = document.getElementById("storageIndexedDB");

var canvasEl = document.getElementById("canvasInfo");
var bounceEl = document.getElementById("bounceInfo");
var hijackEl = document.getElementById("hijackInfo");
var hijackDetailsEl = document.getElementById("hijackDetails");

var scoreSection = document.getElementById("scoreSection");
var scoreValueEl = document.getElementById("scoreValue");
var scoreLabelEl = document.getElementById("scoreLabel");
var scoreBreakdownEl = document.getElementById("scoreBreakdown");

var MULTI_TLDS = [
  "com.br", "com.au", "co.uk", "co.jp", "co.nz",
  "com.ar", "com.mx", "com.pt", "com.es", "com.it",
  "org.br", "net.br", "gov.br", "edu.br"
];

function baseDomain(host) {
  if (!host) {
    return null;
  }

  var parts = host.split(".");
  if (parts.length <= 2) {
    return host;
  }

  var last2 = parts.slice(-2).join(".");
  if (MULTI_TLDS.indexOf(last2) !== -1) {
    return parts.slice(-3).join(".");
  }

  return last2;
}

function showError(text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.textContent = "";
  errorEl.hidden = true;
}

function renderDomains(domains, blocklist) {
  domainsEl.innerHTML = "";

  var entries = Object.entries(domains);
  entries.sort(function (a, b) {
    return b[1].requestCount - a[1].requestCount;
  });

  if (entries.length === 0) {
    domainsEl.textContent = "Nenhum domínio de terceira parte detectado.";
    return;
  }

  var inList = new Set(blocklist);

  for (var i = 0; i < entries.length; i++) {
    var hostname = entries[i][0];
    var info = entries[i][1];
    var base = baseDomain(hostname);
    var locked = info.blocked === true || inList.has(base) || inList.has(hostname);

    var box = document.createElement("div");
    box.className = "domain";

    if (info.blocked) {
      box.classList.add("domain-blocked");
    }

    var head = document.createElement("div");
    head.className = "domain-header";

    var nameEl = document.createElement("div");
    nameEl.className = "domain-name";
    nameEl.textContent = hostname;
    head.appendChild(nameEl);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "domain-block-btn";
    btn.textContent = locked ? "Bloqueado" : "Bloquear";
    btn.disabled = locked;

    if (!locked) {
      (function (target, button) {
        button.addEventListener("click", function () {
          browser.runtime.sendMessage({
            type: "add-to-blocklist",
            domain: target
          }).then(function () {
            button.textContent = "Bloqueado";
            button.disabled = true;
          });
        });
      })(base || hostname, btn);
    }

    head.appendChild(btn);
    box.appendChild(head);

    var meta = document.createElement("div");
    meta.className = "domain-meta";
    meta.textContent = info.requestCount + " requisição(ões) · tipo(s): " +
      (info.resourceTypes.join(", ") || "não identificado");
    box.appendChild(meta);

    var cls = document.createElement("div");
    cls.className = "domain-classification";

    if (info.trackingClassification.length > 0) {
      cls.textContent = "Classificação Firefox: " +
        info.trackingClassification.join(", ");
    } else {
      cls.textContent = "Classificação Firefox: nenhuma registrada";
    }

    box.appendChild(cls);
    domainsEl.appendChild(box);
  }
}

function renderCookies(c) {
  c1s.textContent = c.firstParty.session;
  c1p.textContent = c.firstParty.persistent;
  c3s.textContent = c.thirdParty.session;
  c3p.textContent = c.thirdParty.persistent;
}

function renderStorage(s) {
  function set(el, used, detail) {
    if (used) {
      el.textContent = detail ? "usado (" + detail + ")" : "usado";
      el.className = "badge-bad";
    } else {
      el.textContent = "não usado";
      el.className = "badge-ok";
    }
  }

  var lk = s.localStorage.keys.length;
  var sk = s.sessionStorage.keys.length;
  var db = s.indexedDB.databases;

  set(stLocal, s.localStorage.used, lk > 0 ? lk + " chaves" : null);
  set(stSession, s.sessionStorage.used, sk > 0 ? sk + " chaves" : null);
  set(stIDB, s.indexedDB.used, db.length > 0 ? db.join(", ") : null);
}

function renderCanvas(c) {
  if (c.detected) {
    canvasEl.textContent = "Detectado — métodos: " + c.methods.join(", ");
    canvasEl.className = "badge-bad";
  } else {
    canvasEl.textContent = "Não detectado";
    canvasEl.className = "badge-ok";
  }
}

function renderBounce(b) {
  if (b.detected) {
    bounceEl.textContent = "Detectado — " + b.chains.length + " ocorrência(s)";
    bounceEl.className = "badge-bad";
  } else {
    bounceEl.textContent = "Não detectado";
    bounceEl.className = "badge-ok";
  }
}

function renderHijack(h) {
  hijackDetailsEl.innerHTML = "";

  if (!h.detected) {
    hijackEl.textContent = "Não detectado";
    hijackEl.className = "badge-ok";
    return;
  }

  hijackEl.textContent = "Detectado";
  hijackEl.className = "badge-bad";

  h.websockets.forEach(function (w) {
    var li = document.createElement("li");
    li.textContent = "WebSocket → " + w;
    hijackDetailsEl.appendChild(li);
  });

  h.globalOverwrites.forEach(function (g) {
    var li = document.createElement("li");
    li.textContent = "Global sobrescrito: " + g;
    hijackDetailsEl.appendChild(li);
  });
}

function renderScore(s) {
  scoreSection.classList.remove("score-good", "score-moderate", "score-bad");
  scoreValueEl.textContent = s.score;
  scoreLabelEl.textContent = s.label;

  var cls = "score-good";

  if (s.score < 50) {
    cls = "score-bad";
  } else if (s.score < 80) {
    cls = "score-moderate";
  }

  scoreSection.classList.add(cls);

  scoreBreakdownEl.innerHTML = "";

  s.breakdown.forEach(function (item) {
    var li = document.createElement("li");
    li.textContent = item.criterion + ": −" + item.penalty.toFixed(1) +
      " (" + item.detail + ")";
    scoreBreakdownEl.appendChild(li);
  });
}

function loadReport() {
  clearError();
  pageHostEl.textContent = "Carregando...";
  reqCountEl.textContent = "0";
  domCountEl.textContent = "0";
  blockedCountEl.textContent = "0";
  domainsEl.textContent = "Carregando...";

  browser.tabs.query({ active: true, currentWindow: true })
    .then(function (tabs) {
      var tab = tabs[0];

      if (!tab || typeof tab.id !== "number") {
        throw new Error("Não foi possível identificar a aba atual.");
      }

      return Promise.all([
        browser.runtime.sendMessage({ type: "get-report", tabId: tab.id }),
        browser.runtime.sendMessage({ type: "get-blocklist" })
      ]);
    })
    .then(function (results) {
      var report = results[0];
      var blResp = results[1];
      var blocklist = (blResp && blResp.blocklist) || [];

      if (!report || report.error) {
        throw new Error((report && report.error) || "Relatório indisponível.");
      }

      pageHostEl.textContent = report.pageHost || "desconhecido";
      reqCountEl.textContent = report.thirdPartyRequestCount;
      blockedCountEl.textContent = report.blockedCount || 0;

      var domains = Object.keys(report.thirdPartyDomains);
      domCountEl.textContent = domains.length;

      renderDomains(report.thirdPartyDomains, blocklist);
      renderCookies(report.cookies);
      renderStorage(report.storage);
      renderCanvas(report.canvas || { detected: false, methods: [] });
      renderBounce(report.bounceTracking || { detected: false, chains: [] });
      renderHijack(
        report.hijacking || {
          detected: false,
          websockets: [],
          globalOverwrites: []
        }
      );

      if (report.score) {
        renderScore(report.score);
      }
    })
    .catch(function (err) {
      console.error("[Privacy Inspector]", err);
      pageHostEl.textContent = "Indisponível";
      domainsEl.textContent = "";
      showError(err.message);
    });
}

refreshBtn.addEventListener("click", loadReport);

openOptionsLink.addEventListener("click", function (ev) {
  ev.preventDefault();
  browser.runtime.openOptionsPage();
});

loadReport();