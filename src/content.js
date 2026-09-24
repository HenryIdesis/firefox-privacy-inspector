"use strict";

var script = document.createElement("script");
script.src = browser.runtime.getURL("src/inject.js");
script.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "privacy-inspector") return;
  if (event.data.type !== "storage-event") return;

  browser.runtime
    .sendMessage({
      type: "storage-event",
      storageType: event.data.storageType,
      key: event.data.key
    })
    .catch(function () {
    });
});