(function () {
  "use strict";

  var file = new URLSearchParams(location.search).get("file") || "";
  var doc = document.getElementById("doc");
  var downloadBtn = document.getElementById("download");

  function safeName(name) {
    if (!name || name.length > 140 || name.indexOf("/") !== -1 || name.indexOf("\\") !== -1) return false;
    if (name.charAt(0) === "." || name.indexOf("..") !== -1) return false;
    if (name.toLowerCase() === "library.json") return false;
    return /^[^\\/:*?"<>|]+$/.test(name) && /\.[A-Za-z0-9]{1,12}$/.test(name);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeUrl(url) {
    var clean = String(url || "").trim().replace(/&amp;/g, "&");
    if (/^(https?:|mailto:)/i.test(clean)) return clean;
    if (/^sources\/[^\\/]+$/i.test(clean) || /^[^:\\/][^:\\]*$/.test(clean) && clean.indexOf("..") === -1) return clean;
    return "";
  }

  function renderMarkdown(src) {
    var text = escapeHtml(src).replace(/\r\n/g, "\n");
    var blocks = [];
    text = text.replace(/```([\s\S]*?)```/g, function (_, code) {
      blocks.push("<pre><code>" + code.replace(/^\n/, "") + "</code></pre>");
      return "@@BLOCK" + (blocks.length - 1) + "@@";
    });
    var lines = text.split("\n");
    var html = [];
    var list = null;
    function closeList() {
      if (list) {
        html.push(list === "ol" ? "</ol>" : "</ul>");
        list = null;
      }
    }
    lines.forEach(function (line) {
      var block = line.match(/^@@BLOCK(\d+)@@$/);
      if (block) {
        closeList();
        html.push(blocks[Number(block[1])]);
        return;
      }
      var heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        var level = heading[1].length;
        html.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
        return;
      }
      var ul = line.match(/^\s*[-*]\s+(.+)$/);
      var ol = line.match(/^\s*\d+\.\s+(.+)$/);
      if (ul || ol) {
        var kind = ul ? "ul" : "ol";
        if (list !== kind) {
          closeList();
          list = kind;
          html.push(kind === "ol" ? "<ol>" : "<ul>");
        }
        html.push("<li>" + inline((ul || ol)[1]) + "</li>");
        return;
      }
      if (!line.trim()) {
        closeList();
        return;
      }
      if (line.indexOf("&gt; ") === 0) {
        closeList();
        html.push("<blockquote>" + inline(line.slice(5)) + "</blockquote>");
        return;
      }
      closeList();
      html.push("<p>" + inline(line) + "</p>");
    });
    closeList();
    return html.join("\n");
  }

  function inline(value) {
    return value
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_, alt, url) {
        var href = safeUrl(url);
        return href ? '<img alt="' + alt + '" src="' + escapeHtml(href) + '">' : escapeHtml(alt);
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, url) {
        var href = safeUrl(url);
        return href ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + label + "</a>" : label;
      })
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function fail(message) {
    doc.innerHTML = '<p class="error">' + escapeHtml(message) + "</p>";
  }

  if (!safeName(file)) {
    fail("نام فایل معتبر نیست.");
    downloadBtn.hidden = true;
    return;
  }

  var url = "sources/" + encodeURIComponent(file);
  document.title = file;

  downloadBtn.addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  fetch(url, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("missing");
      return res.text();
    })
    .then(function (text) {
      var ext = file.split(".").pop().toLowerCase();
      if (ext === "md" || ext === "markdown") doc.innerHTML = renderMarkdown(text);
      else doc.innerHTML = '<pre class="plain"></pre>';
      if (ext !== "md" && ext !== "markdown") doc.querySelector("pre").textContent = text;
      var heading = doc.querySelector("h1");
      if (heading) document.title = heading.textContent;
    })
    .catch(function () {
      fail("این منبع پیدا نشد. اگر همین الان اضافه شده، یک دقیقه دیگر دوباره بازش کن.");
    });
})();
