"use strict";

(function () {
  function post(storageType, key) {
    window.postMessage(
      {
        source: "privacy-inspector",
        type: "storage-event",
        storageType: storageType,
        key: String(key)
      },
      "*"
    );
  }

  var originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key) {
    var storageType =
      this === window.localStorage
        ? "localStorage"
        : this === window.sessionStorage
        ? "sessionStorage"
        : "unknown";

    post(storageType, key);
    return originalSetItem.apply(this, arguments);
  };

  var originalOpen = indexedDB.open;
  indexedDB.open = function (name) {
    post("indexedDB", name);
    return originalOpen.apply(this, arguments);
  };
})();