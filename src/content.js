"use strict";

window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "privacy-inspector") return;

  var payload = Object.assign({}, event.data);
  delete payload.source;

  browser.runtime.sendMessage(payload).catch(function () {
  });
});