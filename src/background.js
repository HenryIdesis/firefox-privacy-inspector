"use strict";

const reports = new Map();

function isWebUrl(url) {
  return typeof url === "string" &&
    (url.startsWith("http://") || url.startsWith("https://"));
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const MULTI_LEVEL_TLDS = [
  "com.br", "com.au", "co.uk", "co.jp", "co.nz",
  "com.ar", "com.mx", "com.pt", "com.es", "com.it",
  "org.br", "net.br", "gov.br", "edu.br"
];

function getBaseDomain(hostname) {
  if (!hostname) return null;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;

  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");

  if (MULTI_LEVEL_TLDS.includes(lastTwo)) {
    return lastThree;
  }
  return lastTwo;
}

function isThirdParty(requestHost, pageHost) {
  if (!requestHost || !pageHost) return false;
  const reqBase = getBaseDomain(requestHost);
  const pageBase = getBaseDomain(pageHost);
  if (!reqBase || !pageBase) return false;
  return reqBase !== pageBase;
}

function createReport(tabId, pageUrl = null) {
  const pageHost = getHostname(pageUrl);
  return {
    tabId,
    pageUrl,
    pageHost,
    pageBaseDomain: getBaseDomain(pageHost),
    startedAt: Date.now(),

    thirdPartyRequestCount: 0,
    thirdPartyDomains: {},

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

    hijacking: {
      detected: false,
      websockets: [],
      globalOverwrites: []
    },

    bounceTracking: {
      detected: false,
      chains: []
    }
  };
}

function getOrCreateReport(tabId, fallbackUrl = null) {
  if (!reports.has(tabId)) {
    reports.set(tabId, createReport(tabId, fallbackUrl));
  }
  return reports.get(tabId);
}

function addUnique(array, value) {
  if (value && !array.includes(value)) {
    array.push(value);
  }
}

function recordThirdPartyRequest(report, details) {
  const hostname = getHostname(details.url);
  if (!hostname) return;

  report.thirdPartyRequestCount += 1;

  if (!report.thirdPartyDomains[hostname]) {
    report.thirdPartyDomains[hostname] = {
      requestCount: 0,
      resourceTypes: [],
      trackingClassification: [],
      sampleUrls: []
    };
  }

  const domain = report.thirdPartyDomains[hostname];
  domain.requestCount += 1;
  addUnique(domain.resourceTypes, details.type);

  const classification = details.urlClassification?.thirdParty ?? [];
  for (const item of classification) {
    addUnique(domain.trackingClassification, item);
  }

  if (domain.sampleUrls.length < 5) {
    addUnique(domain.sampleUrls, details.url);
  }
}

function classifySetCookie(value) {
  const maxAgeMatch = value.match(/(^|;)\s*max-age\s*=\s*(-?\d+)/i);
  if (maxAgeMatch) {
    const seconds = parseInt(maxAgeMatch[2], 10);
    if (seconds <= 0) return "delete";
    return "persistent";
  }

  const expiresMatch = value.match(/(^|;)\s*expires\s*=\s*([^;]+)/i);
  if (expiresMatch) {
    const when = Date.parse(expiresMatch[2]);
    if (!isNaN(when) && when <= Date.now()) return "delete";
    return "persistent";
  }

  return "session";
}

function looksLikeSyncPayload(url) {
  try {
    const params = new URL(url).searchParams;
    for (const [, value] of params) {
      if (value.length >= 40 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeScore(report) {
  const breakdown = [];

  const domainPenalty = clamp(
    Object.keys(report.thirdPartyDomains).length * 1,
    0,
    25
  );
  breakdown.push({
    criterion: "Domínios de terceira parte",
    penalty: domainPenalty,
    detail: Object.keys(report.thirdPartyDomains).length + " domínios (teto 25)"
  });

  const reqPenalty = clamp(report.thirdPartyRequestCount * 0.2, 0, 15);
  breakdown.push({
    criterion: "Requisições de terceira parte",
    penalty: reqPenalty,
    detail: report.thirdPartyRequestCount + " requisições (teto 15)"
  });

  const cThirdPersistent = report.cookies.thirdParty.persistent;
  const cThirdPersistentPenalty = clamp(cThirdPersistent * 2, 0, 15);
  breakdown.push({
    criterion: "Cookies de 3ª parte persistentes",
    penalty: cThirdPersistentPenalty,
    detail: cThirdPersistent + " cookies (teto 15)"
  });

  const cThirdSession = report.cookies.thirdParty.session;
  const cThirdSessionPenalty = clamp(cThirdSession * 0.5, 0, 5);
  breakdown.push({
    criterion: "Cookies de 3ª parte de sessão",
    penalty: cThirdSessionPenalty,
    detail: cThirdSession + " cookies (teto 5)"
  });

  const cFirstPersistent = report.cookies.firstParty.persistent;
  const cFirstPenalty = clamp(cFirstPersistent * 0.2, 0, 3);
  breakdown.push({
    criterion: "Cookies de 1ª parte persistentes",
    penalty: cFirstPenalty,
    detail: cFirstPersistent + " cookies (teto 3)"
  });

  let storagePenalty = 0;
  if (report.storage.localStorage.used) storagePenalty += 5;
  if (report.storage.sessionStorage.used) storagePenalty += 3;
  if (report.storage.indexedDB.used) storagePenalty += 5;
  breakdown.push({
    criterion: "Armazenamento HTML5",
    penalty: storagePenalty,
    detail: [
      report.storage.localStorage.used ? "localStorage" : null,
      report.storage.sessionStorage.used ? "sessionStorage" : null,
      report.storage.indexedDB.used ? "IndexedDB" : null
    ].filter(Boolean).join(", ") || "nenhum"
  });

  const canvasPenalty = report.canvas.detected ? 15 : 0;
  breakdown.push({
    criterion: "Canvas fingerprint",
    penalty: canvasPenalty,
    detail: report.canvas.detected
      ? "detectado: " + report.canvas.methods.join(", ")
      : "não detectado"
  });

  const bouncePenalty = report.bounceTracking.detected ? 10 : 0;
  breakdown.push({
    criterion: "Bounce tracking / cookie sync",
    penalty: bouncePenalty,
    detail: report.bounceTracking.detected
      ? report.bounceTracking.chains.length + " ocorrências"
      : "não detectado"
  });

  const hijackPenalty = report.hijacking.detected ? 20 : 0;
  breakdown.push({
    criterion: "Hijacking / hook",
    penalty: hijackPenalty,
    detail: report.hijacking.detected
      ? [
          ...report.hijacking.websockets.map((w) => "WS " + w),
          ...report.hijacking.globalOverwrites.map((g) => "global " + g)
        ].join(", ")
      : "não detectado"
  });

  const totalPenalty = breakdown.reduce((acc, b) => acc + b.penalty, 0);
  const score = Math.max(0, Math.round(100 - totalPenalty));

  let label = "Boa";
  if (score < 50) label = "Ruim";
  else if (score < 80) label = "Moderada";

  return { score, label, breakdown };
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || !isWebUrl(details.url)) return;

    if (details.type === "main_frame") {
      reports.set(details.tabId, createReport(details.tabId, details.url));
      console.log("[Privacy Inspector] nova página:", details.tabId, details.url);
      return;
    }

    const report = getOrCreateReport(
      details.tabId,
      details.documentUrl ?? details.originUrl ?? null
    );

    const requestHost = getHostname(details.url);
    if (!requestHost) return;

    if (isThirdParty(requestHost, report.pageHost)) {
      recordThirdPartyRequest(report, details);

      if (looksLikeSyncPayload(details.url)) {
        report.bounceTracking.detected = true;
        const key = requestHost + "::" + details.type;
        addUnique(report.bounceTracking.chains, key);
      }
    }
  },
  { urls: ["<all_urls>"] }
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const report = reports.get(details.tabId);
    if (!report) return;

    const headers = details.responseHeaders || [];
    const setCookies = headers.filter(
      (h) => h.name.toLowerCase() === "set-cookie"
    );

    if (setCookies.length === 0) return;

    const requestHost = getHostname(details.url);
    const third = isThirdParty(requestHost, report.pageHost);
    const bucket = third ? report.cookies.thirdParty : report.cookies.firstParty;

    for (const header of setCookies) {
      const kind = classifySetCookie(header.value);
      if (kind === "delete") continue;
      if (kind === "persistent") bucket.persistent += 1;
      else bucket.session += 1;
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "blocking"]
);

browser.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const report = reports.get(details.tabId);
    if (!report) return;

    const from = getHostname(details.url);
    const to = getHostname(details.redirectUrl);
    if (!from || !to || from === to) return;

    const fromThird = isThirdParty(from, report.pageHost);
    const toThird = isThirdParty(to, report.pageHost);

    if (fromThird && toThird) {
      report.bounceTracking.detected = true;
      addUnique(report.bounceTracking.chains, from + " -> " + to);
    }
  },
  { urls: ["<all_urls>"] }
);

/*msg*/

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (sender.tab) {
    const report = reports.get(sender.tab.id);
    if (!report) return;

    if (message.type === "storage-event") {
      const { storageType, key } = message;
      if (storageType === "indexedDB") {
        report.storage.indexedDB.used = true;
        addUnique(report.storage.indexedDB.databases, key);
      } else if (
        storageType === "localStorage" ||
        storageType === "sessionStorage"
      ) {
        report.storage[storageType].used = true;
        addUnique(report.storage[storageType].keys, key);
      }
      return;
    }

    if (message.type === "canvas-event") {
      report.canvas.detected = true;
      addUnique(report.canvas.methods, message.method);
      return;
    }

    if (message.type === "websocket-event") {
      const host = getHostname(message.url);
      if (!host) return;

      if (isThirdParty(host, report.pageHost)) {
        report.hijacking.detected = true;
        addUnique(report.hijacking.websockets, host);
      }
      return;
    }

    if (message.type === "global-overwrite") {
      report.hijacking.detected = true;
      addUnique(report.hijacking.globalOverwrites, message.name);
      return;
    }
  }

  if (message.type === "get-report") {
    const report = reports.get(message.tabId);
    if (!report) {
      sendResponse({ error: "Nenhum relatório disponível para esta aba." });
      return;
    }
    const score = computeScore(report);
    sendResponse(Object.assign({}, report, { score }));
    return;
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  reports.delete(tabId);
});

console.log("[Privacy Inspector] detector de terceira parte carregado");