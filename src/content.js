"use strict";

// The page runs in the MAIN world, so its postMessage channel is not trusted.
// Only forward the small telemetry vocabulary used by inject.js. Commands that
// read reports or mutate the blocklist must come from extension pages instead.
var TELEMETRY_TYPES = {
  "storage-event": true,
  "canvas-event": true,
  "websocket-event": true,
  "global-overwrite": true
};

function isString(value) {
  return typeof value === "string";
}

function telemetryFromPage(data) {
  if (!data || !TELEMETRY_TYPES[data.type]) {
    return null;
  }

  if (data.type === "storage-event") {
    if (
      ["indexedDB", "localStorage", "sessionStorage"].indexOf(data.storageType) === -1 ||
      !isString(data.key)
    ) {
      return null;
    }

    return {
      type: data.type,
      storageType: data.storageType,
      key: data.key
    };
  }

  if (data.type === "canvas-event") {
    if (!isString(data.method) || data.method.length > 64) {
      return null;
    }

    return { type: data.type, method: data.method };
  }

  if (data.type === "websocket-event") {
    if (!isString(data.url) || !/^wss?:/i.test(data.url)) {
      return null;
    }

    return { type: data.type, url: data.url };
  }

  if (["fetch", "XMLHttpRequest", "eval"].indexOf(data.name) === -1) {
    return null;
  }

  return { type: data.type, name: data.name };
}

window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "privacy-inspector") return;

  var payload = telemetryFromPage(event.data);
  if (!payload) return;

  browser.runtime.sendMessage(payload).catch(function () {
  });
});
