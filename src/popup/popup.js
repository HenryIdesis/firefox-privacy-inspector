"use strict";

const pageHostElement = document.getElementById("pageHost");
const requestCountElement = document.getElementById("requestCount");
const domainCountElement = document.getElementById("domainCount");
const domainsElement = document.getElementById("domains");
const errorMessageElement = document.getElementById("errorMessage");
const refreshButton = document.getElementById("refreshButton");

const cookiesFirstSession = document.getElementById("cookiesFirstSession");
const cookiesFirstPersistent = document.getElementById("cookiesFirstPersistent");
const cookiesThirdSession = document.getElementById("cookiesThirdSession");
const cookiesThirdPersistent = document.getElementById("cookiesThirdPersistent");

const storageLocal = document.getElementById("storageLocal");
const storageSession = document.getElementById("storageSession");
const storageIndexedDB = document.getElementById("storageIndexedDB");

function showError(message) {
  errorMessageElement.textContent = message;
  errorMessageElement.hidden = false;
}

function clearError() {
  errorMessageElement.textContent = "";
  errorMessageElement.hidden = true;
}

function renderDomains(thirdPartyDomains) {
  domainsElement.innerHTML = "";

  const entries = Object.entries(thirdPartyDomains);
  entries.sort((a, b) => b[1].requestCount - a[1].requestCount);

  if (entries.length === 0) {
    domainsElement.textContent = "Nenhum domínio de terceira parte detectado.";
    return;
  }

  for (const [hostname, info] of entries) {
    const container = document.createElement("div");
    container.className = "domain";

    const name = document.createElement("div");
    name.className = "domain-name";
    name.textContent = hostname;

    const meta = document.createElement("div");
    meta.className = "domain-meta";
    meta.textContent =
      `${info.requestCount} requisição(ões) · ` +
      `tipo(s): ${info.resourceTypes.join(", ") || "não identificado"}`;

    const classification = document.createElement("div");
    classification.className = "domain-classification";
    classification.textContent =
      info.trackingClassification.length > 0
        ? `Classificação Firefox: ${info.trackingClassification.join(", ")}`
        : "Classificação Firefox: nenhuma registrada";

    container.appendChild(name);
    container.appendChild(meta);
    container.appendChild(classification);
    domainsElement.appendChild(container);
  }
}

function renderCookies(cookies) {
  cookiesFirstSession.textContent = String(cookies.firstParty.session);
  cookiesFirstPersistent.textContent = String(cookies.firstParty.persistent);
  cookiesThirdSession.textContent = String(cookies.thirdParty.session);
  cookiesThirdPersistent.textContent = String(cookies.thirdParty.persistent);
}

function renderStorage(storage) {
  function set(el, used, detail) {
    if (used) {
      el.textContent = detail ? `usado (${detail})` : "usado";
      el.className = "used";
    } else {
      el.textContent = "não usado";
      el.className = "unused";
    }
  }

  set(
    storageLocal,
    storage.localStorage.used,
    storage.localStorage.keys.length > 0
      ? storage.localStorage.keys.length + " chaves"
      : null
  );

  set(
    storageSession,
    storage.sessionStorage.used,
    storage.sessionStorage.keys.length > 0
      ? storage.sessionStorage.keys.length + " chaves"
      : null
  );

  set(
    storageIndexedDB,
    storage.indexedDB.used,
    storage.indexedDB.databases.length > 0
      ? storage.indexedDB.databases.join(", ")
      : null
  );
}

async function loadReport() {
  clearError();

  pageHostElement.textContent = "Carregando...";
  requestCountElement.textContent = "0";
  domainCountElement.textContent = "0";
  domainsElement.textContent = "Carregando...";

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    const tab = tabs[0];

    if (!tab || typeof tab.id !== "number") {
      throw new Error("Não foi possível identificar a aba atual.");
    }

    const report = await browser.runtime.sendMessage({
      type: "get-report",
      tabId: tab.id
    });

    if (!report || report.error) {
      throw new Error(report?.error ?? "Relatório indisponível.");
    }

    pageHostElement.textContent = report.pageHost ?? "desconhecido";
    requestCountElement.textContent = String(report.thirdPartyRequestCount);

    const domains = Object.keys(report.thirdPartyDomains);
    domainCountElement.textContent = String(domains.length);

    renderDomains(report.thirdPartyDomains);
    renderCookies(report.cookies);
    renderStorage(report.storage);
  } catch (error) {
    console.error("[Privacy Inspector] erro ao carregar relatório:", error);
    pageHostElement.textContent = "Indisponível";
    domainsElement.textContent = "";
    showError(error.message);
  }
}

refreshButton.addEventListener("click", loadReport);

loadReport();