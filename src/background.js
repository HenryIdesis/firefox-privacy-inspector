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

function createReport(tabId, pageUrl = null) {
  return {
    tabId,
    pageUrl,
    pageHost: getHostname(pageUrl),
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

function isPersistentSetCookie(value) {
  return /(^|;)\s*(expires|max-age)\s*=/i.test(value);
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

    if (details.thirdParty === true) {
      recordThirdPartyRequest(report, details);
      console.log(
        "[Privacy Inspector] terceira parte:",
        getHostname(details.url),
        details.type,
        details.url
      );
    }
  },
  { urls: ["<all_urls>"] }
);

/* Cookie do Set */

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

    const bucket = details.thirdParty === true
      ? report.cookies.thirdParty
      : report.cookies.firstParty;

    for (const header of setCookies) {
      if (isPersistentSetCookie(header.value)) {
        bucket.persistent += 1;
      } else {
        bucket.session += 1;
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "blocking"]
);

/* msg */

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "storage-event" && sender.tab) {
    const report = reports.get(sender.tab.id);
    if (!report) return;

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

  if (message.type === "get-report") {
    const report = reports.get(message.tabId);
    if (!report) {
      sendResponse({ error: "Nenhum relatório disponível para esta aba." });
      return;
    }
    sendResponse(report);
    return;
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  reports.delete(tabId);
});

console.log("[Privacy Inspector] detector de terceira parte carregado");