"use strict";

var reports = new Map();
var blocklist = new Set();

browser.storage.local.get("blocklist").then(function (s) {
  blocklist = new Set(s.blocklist || []);
});

browser.storage.onChanged.addListener(function (ch, area) {
  if (area === "local" && ch.blocklist) {
    blocklist = new Set(ch.blocklist.newValue || []);
  }
});

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

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

function isThirdParty(reqHost, pageHost) {
  if (!reqHost || !pageHost) {
    return false;
  }

  var a = baseDomain(reqHost);
  var b = baseDomain(pageHost);

  if (!a || !b) {
    return false;
  }

  return a !== b;
}

function isBlocked(host) {
  if (!host) {
    return false;
  }

  var it = blocklist.values();
  var cur = it.next();

  while (!cur.done) {
    var entry = cur.value;
    if (host === entry || host.endsWith("." + entry)) {
      return true;
    }
    cur = it.next();
  }

  return false;
}

function newReport(tabId, url) {
  return {
    tabId: tabId,
    pageUrl: url,
    pageHost: hostnameOf(url),
    startedAt: Date.now(),
    thirdPartyRequestCount: 0,
    thirdPartyDomains: {},
    blockedCount: 0,
    cookies: {
      firstParty: { session: 0, persistent: 0 },
      thirdParty: { session: 0, persistent: 0 }
    },
    storage: {
      localStorage: { used: false, keys: [] },
      sessionStorage: { used: false, keys: [] },
      indexedDB: { used: false, databases: [] }
    },
    canvas: { detected: false, methods: [] },
    hijacking: { detected: false, websockets: [], globalOverwrites: [] },
    bounceTracking: { detected: false, chains: [] }
  };
}

function reportFor(tabId, fallback) {
  if (!reports.has(tabId)) {
    reports.set(tabId, newReport(tabId, fallback));
  }

  return reports.get(tabId);
}

function push(arr, val) {
  if (val && arr.indexOf(val) === -1) {
    arr.push(val);
  }
}

function trackThird(report, details) {
  var host = hostnameOf(details.url);
  if (!host) {
    return;
  }

  report.thirdPartyRequestCount++;

  if (!report.thirdPartyDomains[host]) {
    report.thirdPartyDomains[host] = {
      requestCount: 0,
      resourceTypes: [],
      trackingClassification: [],
      sampleUrls: []
    };
  }

  var d = report.thirdPartyDomains[host];
  d.requestCount++;
  push(d.resourceTypes, details.type);

  if (details.urlClassification && details.urlClassification.thirdParty) {
    var list = details.urlClassification.thirdParty;
    for (var i = 0; i < list.length; i++) {
      push(d.trackingClassification, list[i]);
    }
  }

  if (d.sampleUrls.length < 5) {
    push(d.sampleUrls, details.url);
  }
}

function cookieKind(value) {
  var m = value.match(/(^|;)\s*max-age\s*=\s*(-?\d+)/i);

  if (m) {
    var secs = parseInt(m[2], 10);
    if (secs <= 0) {
      return "delete";
    }
    return "persistent";
  }

  m = value.match(/(^|;)\s*expires\s*=\s*([^;]+)/i);
  if (m) {
    var when = Date.parse(m[2]);
    if (!isNaN(when) && when <= Date.now()) {
      return "delete";
    }
    return "persistent";
  }

  return "session";
}

function looksLikeSync(url) {
  try {
    var params = new URL(url).searchParams;

    for (var pair of params) {
      var v = pair[1];
      if (v.length >= 40 && /^[A-Za-z0-9+\/=_-]+$/.test(v)) {
        return true;
      }
    }
  } catch (e) {
  }

  return false;
}

function computeScore(report) {
  var items = [];

  var domainCount = Object.keys(report.thirdPartyDomains).length;
  items.push({
    criterion: "Domínios de terceira parte",
    penalty: Math.max(0, Math.min(25, domainCount * 1)),
    detail: domainCount + " domínios (teto 25)"
  });

  items.push({
    criterion: "Requisições de terceira parte",
    penalty: Math.max(0, Math.min(15, report.thirdPartyRequestCount * 0.2)),
    detail: report.thirdPartyRequestCount + " requisições (teto 15)"
  });

  var ctp = report.cookies.thirdParty.persistent;
  items.push({
    criterion: "Cookies de 3ª parte persistentes",
    penalty: Math.max(0, Math.min(15, ctp * 2)),
    detail: ctp + " cookies (teto 15)"
  });

  var cts = report.cookies.thirdParty.session;
  items.push({
    criterion: "Cookies de 3ª parte de sessão",
    penalty: Math.max(0, Math.min(5, cts * 0.5)),
    detail: cts + " cookies (teto 5)"
  });

  var cfp = report.cookies.firstParty.persistent;
  items.push({
    criterion: "Cookies de 1ª parte persistentes",
    penalty: Math.max(0, Math.min(3, cfp * 0.2)),
    detail: cfp + " cookies (teto 3)"
  });

  var st = 0;
  var stParts = [];

  if (report.storage.localStorage.used) {
    st += 5;
    stParts.push("localStorage");
  }
  if (report.storage.sessionStorage.used) {
    st += 3;
    stParts.push("sessionStorage");
  }
  if (report.storage.indexedDB.used) {
    st += 5;
    stParts.push("IndexedDB");
  }

  items.push({
    criterion: "Armazenamento HTML5",
    penalty: st,
    detail: stParts.length ? stParts.join(", ") : "nenhum"
  });

  items.push({
    criterion: "Canvas fingerprint",
    penalty: report.canvas.detected ? 15 : 0,
    detail: report.canvas.detected ? "detectado" : "não detectado"
  });

  items.push({
    criterion: "Bounce tracking / cookie sync",
    penalty: report.bounceTracking.detected ? 10 : 0,
    detail: report.bounceTracking.detected
      ? report.bounceTracking.chains.length + " ocorrências"
      : "não detectado"
  });

  items.push({
    criterion: "Hijacking / hook",
    penalty: report.hijacking.detected ? 20 : 0,
    detail: report.hijacking.detected ? "detectado" : "não detectado"
  });

  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total += items[i].penalty;
  }

  var score = Math.max(0, Math.round(100 - total));
  var label = "Boa";

  if (score < 50) {
    label = "Ruim";
  } else if (score < 80) {
    label = "Moderada";
  }

  return { score: score, label: label, breakdown: items };
}

browser.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.tabId < 0) {
      return;
    }
    if (details.url.indexOf("http") !== 0) {
      return;
    }

    if (details.type === "main_frame") {
      reports.set(details.tabId, newReport(details.tabId, details.url));
      return;
    }

    var report = reportFor(
      details.tabId,
      details.documentUrl || details.originUrl || null
    );

    var host = hostnameOf(details.url);
    if (!host) {
      return;
    }

    if (isBlocked(host)) {
      report.blockedCount++;

      if (!report.thirdPartyDomains[host]) {
        report.thirdPartyDomains[host] = {
          requestCount: 0,
          resourceTypes: [],
          trackingClassification: [],
          sampleUrls: [],
          blocked: true
        };
      } else {
        report.thirdPartyDomains[host].blocked = true;
      }

      return { cancel: true };
    }

    if (isThirdParty(host, report.pageHost)) {
      trackThird(report, details);

      if (looksLikeSync(details.url)) {
        report.bounceTracking.detected = true;
        push(report.bounceTracking.chains, host + "::" + details.type);
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

browser.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (details.tabId < 0) {
      return;
    }

    var report = reports.get(details.tabId);
    if (!report) {
      return;
    }

    var headers = details.responseHeaders || [];
    var third = isThirdParty(hostnameOf(details.url), report.pageHost);
    var bucket = third ? report.cookies.thirdParty : report.cookies.firstParty;

    for (var i = 0; i < headers.length; i++) {
      if (headers[i].name.toLowerCase() !== "set-cookie") {
        continue;
      }

      var kind = cookieKind(headers[i].value);
      if (kind === "delete") {
        continue;
      }

      if (kind === "persistent") {
        bucket.persistent++;
      } else {
        bucket.session++;
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "blocking"]
);

browser.webRequest.onBeforeRedirect.addListener(
  function (details) {
    if (details.tabId < 0) {
      return;
    }

    var report = reports.get(details.tabId);
    if (!report) {
      return;
    }

    var from = hostnameOf(details.url);
    var to = hostnameOf(details.redirectUrl);

    if (!from || !to || from === to) {
      return;
    }

    if (isThirdParty(from, report.pageHost) && isThirdParty(to, report.pageHost)) {
      report.bounceTracking.detected = true;
      push(report.bounceTracking.chains, from + " -> " + to);
    }
  },
  { urls: ["<all_urls>"] }
);

browser.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) {
    return;
  }

  if (sender.tab) {
    var report = reports.get(sender.tab.id);
    if (report) {
      if (msg.type === "storage-event") {
        if (msg.storageType === "indexedDB") {
          report.storage.indexedDB.used = true;
          push(report.storage.indexedDB.databases, msg.key);
        } else if (
          msg.storageType === "localStorage" ||
          msg.storageType === "sessionStorage"
        ) {
          report.storage[msg.storageType].used = true;
          push(report.storage[msg.storageType].keys, msg.key);
        }
        return;
      }

      if (msg.type === "canvas-event") {
        report.canvas.detected = true;
        push(report.canvas.methods, msg.method);
        return;
      }

      if (msg.type === "websocket-event") {
        var whost = hostnameOf(msg.url);
        if (whost && isThirdParty(whost, report.pageHost)) {
          report.hijacking.detected = true;
          push(report.hijacking.websockets, whost);
        }
        return;
      }

      if (msg.type === "global-overwrite") {
        report.hijacking.detected = true;
        push(report.hijacking.globalOverwrites, msg.name);
        return;
      }
    }
  }

  if (msg.type === "get-report") {
    var r = reports.get(msg.tabId);

    if (!r) {
      sendResponse({ error: "Nenhum relatório disponível para esta aba." });
      return;
    }

    var score = computeScore(r);
    var payload = Object.assign({}, r, { score: score });
    sendResponse(payload);
    return;
  }

  if (msg.type === "add-to-blocklist" && msg.domain) {
    var domain = String(msg.domain).toLowerCase().trim();
    if (!domain) {
      return;
    }

    browser.storage.local.get("blocklist").then(function (s) {
      var list = s.blocklist || [];
      if (list.indexOf(domain) === -1) {
        list.push(domain);
      }
      return browser.storage.local.set({ blocklist: list });
    }).then(function () {
      sendResponse({ ok: true, domain: domain });
    });

    return true;
  }

  if (msg.type === "get-blocklist") {
    browser.storage.local.get("blocklist").then(function (s) {
      sendResponse({ blocklist: s.blocklist || [] });
    });
    return true;
  }
});

browser.tabs.onRemoved.addListener(function (tabId) {
  reports.delete(tabId);
});