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

    thirdPartyDomains: {}
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

  if (!hostname) {
    return;
  }

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

  const classification =
    details.urlClassification?.thirdParty ?? [];

  for (const item of classification) {
    addUnique(domain.trackingClassification, item);
  }


  if (domain.sampleUrls.length < 5) {
    addUnique(domain.sampleUrls, details.url);
  }
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || !isWebUrl(details.url)) {
      return;
    }

    if (details.type === "main_frame") {
      reports.set(
        details.tabId,
        createReport(details.tabId, details.url)
      );

      console.log(
        "[Privacy Inspector] nova página:",
        details.tabId,
        details.url
      );

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
  {
    urls: ["<all_urls>"]
  }
);

browser.tabs.onRemoved.addListener((tabId) => {
  reports.delete(tabId);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "get-report") {
    return;
  }

  const report = reports.get(message.tabId);

  if (!report) {
    sendResponse({ error: "Nenhum relatório disponível para esta aba." });
    return;
  }

  sendResponse(report);
});

console.log("[Privacy Inspector] detector de terceira parte carregado");