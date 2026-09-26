"use strict";

(function () {
  function post(type, payload) {
    window.postMessage(
      Object.assign(
        { source: "privacy-inspector", type: type },
        payload || {}
      ),
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

    post("storage-event", { storageType: storageType, key: String(key) });
    return originalSetItem.apply(this, arguments);
  };

  var originalOpen = indexedDB.open;
  indexedDB.open = function (name) {
    post("storage-event", { storageType: "indexedDB", key: String(name) });
    return originalOpen.apply(this, arguments);
  };

  function reportCanvas(method) {
    post("canvas-event", { method: method });
  }

  if (window.HTMLCanvasElement) {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () {
      reportCanvas("toDataURL");
      return origToDataURL.apply(this, arguments);
    };

    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function () {
      reportCanvas("toBlob");
      return origToBlob.apply(this, arguments);
    };
  }

  if (window.CanvasRenderingContext2D) {
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function () {
      reportCanvas("getImageData");
      return origGetImageData.apply(this, arguments);
    };
  }
  if (window.OffscreenCanvas) {
    var origOffscreenToDataURL = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function () {
      reportCanvas("OffscreenCanvas.convertToBlob");
      return origOffscreenToDataURL.apply(this, arguments);
    };

    var OrigOffscreenCtx = window.OffscreenCanvasRenderingContext2D;
  if (OrigOffscreenCtx && OrigOffscreenCtx.prototype.getImageData) {
      var origOffGetImageData = OrigOffscreenCtx.prototype.getImageData;
      OrigOffscreenCtx.prototype.getImageData = function () {
        reportCanvas("OffscreenCanvas.getImageData");
        return origOffGetImageData.apply(this, arguments);
      };
    }
  }

  var OriginalWebSocket = window.WebSocket;

  function TrackingWebSocket(url, protocols) {
    post("websocket-event", { url: String(url) });
    return new OriginalWebSocket(url, protocols);
  }

  TrackingWebSocket.prototype = OriginalWebSocket.prototype;
  TrackingWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  TrackingWebSocket.OPEN = OriginalWebSocket.OPEN;
  TrackingWebSocket.CLOSING = OriginalWebSocket.CLOSING;
  TrackingWebSocket.CLOSED = OriginalWebSocket.CLOSED;

  window.WebSocket = TrackingWebSocket;

  function monitorGlobal(name) {
    try {
      var descriptor = Object.getOwnPropertyDescriptor(window, name);
      if (!descriptor) return;

      var currentValue = window[name];

      Object.defineProperty(window, name, {
        get: function () {
          return currentValue;
        },
        set: function (newValue) {
          if (newValue !== currentValue) {
            post("global-overwrite", { name: name });
          }
          currentValue = newValue;
        },
        configurable: true
      });
    } catch (e) {
    }
  }

  ["fetch", "XMLHttpRequest", "eval"].forEach(monitorGlobal);
})();