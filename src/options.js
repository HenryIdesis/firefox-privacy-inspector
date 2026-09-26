"use strict";

var textarea = document.getElementById("blocklistInput");
var saveButton = document.getElementById("saveButton");
var reloadButton = document.getElementById("reloadButton");
var statusEl = document.getElementById("status");

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.className = isError ? "error" : "";

  if (text) {
    setTimeout(function () {
      if (statusEl.textContent === text) {
        statusEl.textContent = "";
        statusEl.className = "";
      }
    }, 3000);
  }
}

function parseList(text) {
  var seen = new Set();
  var result = [];
  var lines = text.split("\n");

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim().toLowerCase();

    if (!line) {
      continue;
    }
    if (line[0] === "#") {
      continue;
    }
    if (seen.has(line)) {
      continue;
    }

    seen.add(line);
    result.push(line);
  }

  return result;
}

function loadBlocklist() {
  browser.storage.local.get("blocklist").then(function (s) {
    var list = s.blocklist || [];
    textarea.value = list.join("\n");
  });
}

function saveBlocklist() {
  var list = parseList(textarea.value);

  browser.storage.local.set({ blocklist: list }).then(function () {
    textarea.value = list.join("\n");
    setStatus("Salvo: " + list.length + " domínio(s).", false);
  });
}

saveButton.addEventListener("click", saveBlocklist);
reloadButton.addEventListener("click", loadBlocklist);

loadBlocklist();