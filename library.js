(function () {
  "use strict";

  var CONFIG = {
    owner: "pouriasafari117",
    repo: "online_files",
    branch: "main",
    dir: "sources"
  };
  var TOKEN_KEY = "online_library_gh_token";
  var MAX_FILE = 8 * 1024 * 1024;
  var TEXT_EXT = { html: 1, htm: 1, md: 1, markdown: 1, txt: 1, csv: 1, json: 1, svg: 1, css: 1 };
  var BLOCKED_EXT = { exe: 1, dll: 1, bat: 1, cmd: 1, com: 1, msi: 1, scr: 1, ps1: 1, sh: 1, bash: 1, app: 1 };
  var KIND_LABEL = { all: "همه", lesson: "درس", document: "سند", note: "یادداشت", image: "تصویر", file: "سایر" };

  var mode = "github";
  var token = "";
  var userLogin = "";
  var sources = [];
  var query = "";
  var kindFilter = "all";
  var sortKey = "newest";
  var pickedFile = null;
  var editing = null;
  var pendingBytes = null;
  var afterAuth = null;
  var toastTimer = 0;
  var stack = [];

  var grid = document.getElementById("grid");
  var filters = document.getElementById("filters");
  var empty = document.getElementById("empty");
  var emptyTitle = document.getElementById("emptyTitle");
  var emptyText = document.getElementById("emptyText");
  var banner = document.getElementById("banner");
  var statCount = document.getElementById("statCount");
  var searchInput = document.getElementById("searchInput");
  var sortSelect = document.getElementById("sortSelect");
  var modeChip = document.getElementById("modeChip");
  var toastEl = document.getElementById("toast");
  var dropOverlay = document.getElementById("dropOverlay");
  var modalAdd = document.getElementById("modalAdd");
  var modalEdit = document.getElementById("modalEdit");
  var modalSettings = document.getElementById("modalSettings");
  var modalConfirm = document.getElementById("modalConfirm");
  var addForm = document.getElementById("addForm");
  var editForm = document.getElementById("editForm");
  var uploadPane = document.getElementById("uploadPane");
  var writePane = document.getElementById("writePane");
  var tabUpload = document.getElementById("tabUpload");
  var tabWrite = document.getElementById("tabWrite");
  var fileInput = document.getElementById("fileInput");
  var fileInfo = document.getElementById("fileInfo");
  var addTitle = document.getElementById("addTitle");
  var addSubject = document.getElementById("addSubject");
  var addDescription = document.getElementById("addDescription");
  var addSubmit = document.getElementById("addSubmit");
  var editHeading = document.getElementById("editHeading");
  var editTitle = document.getElementById("editTitle");
  var editSubject = document.getElementById("editSubject");
  var editDescription = document.getElementById("editDescription");
  var editFilename = document.getElementById("editFilename");
  var editFeatured = document.getElementById("editFeatured");
  var editContent = document.getElementById("editContent");
  var editBinaryNote = document.getElementById("editBinaryNote");
  var editReplace = document.getElementById("editReplace");
  var replaceRow = document.getElementById("replaceRow");
  var editDirBtn = document.getElementById("editDirBtn");
  var editWrapBtn = document.getElementById("editWrapBtn");
  var editPreview = document.getElementById("editPreview");
  var editSave = document.getElementById("editSave");
  var editDelete = document.getElementById("editDelete");
  var editCount = document.getElementById("editCount");
  var filenameHelp = document.getElementById("filenameHelp");
  var settingsLocal = document.getElementById("settingsLocal");
  var settingsGitHub = document.getElementById("settingsGitHub");
  var tokenInput = document.getElementById("tokenInput");
  var tokenStatus = document.getElementById("tokenStatus");
  var confirmTitle = document.getElementById("confirmTitle");
  var confirmText = document.getElementById("confirmText");
  var confirmOk = document.getElementById("confirmOk");
  var confirmCancel = document.getElementById("confirmCancel");

  function faNum(value) {
    return String(value).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }).replace(".", "٫");
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return faNum(n) + " بایت";
    if (n < 1048576) return faNum((n / 1024).toFixed(n < 10240 ? 1 : 0)) + " کیلوبایت";
    return faNum((n / 1048576).toFixed(1)) + " مگابایت";
  }

  function formatDate(iso) {
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(date);
    } catch (e) {
      return "";
    }
  }

  function extOf(filename) {
    var match = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function kindOf(filename) {
    var ext = extOf(filename);
    if (ext === "html" || ext === "htm") return "lesson";
    if (ext === "pdf" || ext === "doc" || ext === "docx" || ext === "ppt" || ext === "pptx") return "document";
    if (ext === "md" || ext === "markdown" || ext === "txt") return "note";
    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp" || ext === "svg") return "image";
    return "file";
  }

  function isBinaryName(filename) {
    return !TEXT_EXT[extOf(filename)];
  }

  function prettyName(filename) {
    return String(filename || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200c/g, " ")
      .trim();
  }

  function isSafeName(name) {
    if (!name || name.length > 140) return false;
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return false;
    if (name.charAt(0) === "." || name.indexOf("..") !== -1) return false;
    if (name.toLowerCase() === "library.json") return false;
    var ext = extOf(name);
    if (!ext || ext.length > 12 || BLOCKED_EXT[ext]) return false;
    return true;
  }

  function slugify(title, ext) {
    var base = String(title || "").trim().replace(/\s+/g, "-");
    base = base.replace(/[\\/:*?"<>|#%&{}]+/g, "").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
    base = base.slice(0, 80) || ("source-" + Date.now());
    base = base.replace(/\.[A-Za-z0-9]{1,8}$/, "");
    return base + "." + String(ext || "txt").replace(/^\./, "");
  }

  function uniqueName(name) {
    var ext = (name.match(/\.[^.]+$/) || [""])[0];
    var stem = ext ? name.slice(0, -ext.length) : name;
    var taken = {};
    sources.forEach(function (item) { taken[item.filename.toLowerCase()] = 1; });
    var candidate = name;
    var n = 2;
    while (taken[candidate.toLowerCase()]) {
      candidate = stem + "-" + n + ext;
      n += 1;
    }
    return candidate;
  }

  function openHref(filename) {
    var ext = extOf(filename);
    if (ext === "md" || ext === "markdown" || ext === "txt" || ext === "csv" || ext === "json") {
      return "viewer.html?file=" + encodeURIComponent(filename);
    }
    return "sources/" + encodeURIComponent(filename);
  }

  function timeOf(item) {
    var t = Date.parse(item.updatedAt || item.createdAt || "");
    return isNaN(t) ? 0 : t;
  }

  function toast(message, isError) {
    toastEl.hidden = false;
    toastEl.textContent = message;
    toastEl.classList.toggle("error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4600);
  }

  function setBusy(btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-busy", !!on);
    btn.disabled = !!on;
  }

  function openModal(el) {
    if (!el.hidden) return;
    el.hidden = false;
    stack.push(el);
    document.body.classList.add("modal-open");
  }

  function closeModal(el) {
    el.hidden = true;
    var index = stack.lastIndexOf(el);
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) document.body.classList.remove("modal-open");
  }

  function snapshot() {
    return JSON.stringify({
      title: editTitle.value,
      subject: editSubject.value,
      description: editDescription.value,
      filename: editFilename.value,
      featured: editFeatured.checked,
      text: editContent.hidden ? "" : editContent.value,
      replace: pendingBytes ? pendingBytes.length : 0
    });
  }

  function isDirty() {
    return !!(editing && snapshot() !== editing.baseline);
  }

  function closeTop() {
    var el = stack[stack.length - 1];
    if (!el) return;
    if (el.id === "modalEdit" && isDirty()) {
      askConfirm({
        title: "تغییرها ذخیره نشده",
        text: "اگر ببندی، چیزی که نوشتی ذخیره نمی‌شود.",
        confirmLabel: "بستن بدون ذخیره",
        danger: true
      }).then(function (ok) { if (ok) closeModal(el); });
      return;
    }
    if (el.id === "modalSettings") afterAuth = null;
    closeModal(el);
  }

  function askConfirm(opts) {
    return new Promise(function (resolve) {
      confirmTitle.textContent = opts.title;
      confirmText.textContent = opts.text;
      confirmOk.textContent = opts.confirmLabel || "تأیید";
      confirmOk.className = opts.danger ? "btn-danger" : "btn-primary";
      function finish(value) {
        confirmOk.onclick = null;
        confirmCancel.onclick = null;
        closeModal(modalConfirm);
        resolve(value);
      }
      confirmOk.onclick = function () { finish(true); };
      confirmCancel.onclick = function () { finish(false); };
      openModal(modalConfirm);
    });
  }

  function ApiError(message, status, data) {
    this.message = message;
    this.status = status || 0;
    this.data = data || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function githubErrorMessage(status, data) {
    var api = data && data.message ? String(data.message) : "";
    if (status === 401) return "توکن پذیرفته نشد. یک توکن تازه بساز و دوباره وصل شو.";
    if (status === 403 && /rate limit/i.test(api)) return "محدودیت تعداد درخواست گیت‌هاب. کمی بعد دوباره تلاش کن.";
    if (status === 403) return "این توکن اجازهٔ نوشتن در مخزن را ندارد.";
    if (status === 404) return "منبع یا مخزن پیدا نشد.";
    if (status === 409) return "منبع همان لحظه تغییر کرده بود. یک بار دیگر ذخیره کن.";
    if (status === 422 && /sha/i.test(api)) return "فایلی با این نام از قبل وجود دارد.";
    if (status === 422) return "گیت‌هاب این فایل را نپذیرفت. نام یا اندازه را بررسی کن.";
    return api || "خطا در ارتباط با گیت‌هاب";
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var size = 8192;
    for (var i = 0; i < bytes.length; i += size) {
      var slice = bytes.subarray(i, Math.min(i + size, bytes.length));
      var chars = new Array(slice.length);
      for (var j = 0; j < slice.length; j++) chars[j] = String.fromCharCode(slice[j]);
      binary += chars.join("");
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    var binary = atob(String(b64 || "").replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function textToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }

  function base64ToText(b64) {
    return new TextDecoder("utf-8").decode(base64ToBytes(b64));
  }

  function contentsPath(filename) {
    return "/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/contents/" + CONFIG.dir + "/" + encodeURIComponent(filename);
  }

  function gh(path, options) {
    options = options || {};
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    var tok = options.token || token;
    if (tok) headers.Authorization = "Bearer " + tok;
    return fetch("https://api.github.com" + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = { message: raw }; }
        if (!res.ok) throw new ApiError(githubErrorMessage(res.status, data), res.status, data);
        return data;
      });
    }).catch(function (err) {
      if (err instanceof ApiError || (err && err.status)) throw err;
      throw new ApiError("اتصال به گیت‌هاب برقرار نشد", 0);
    });
  }

  function verifyToken(value) {
    return gh("/repos/" + CONFIG.owner + "/" + CONFIG.repo, { token: value }).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new ApiError("این توکن اجازهٔ نوشتن در مخزن را ندارد", 403);
      }
      return gh("/user", { token: value });
    }).then(function (user) {
      return user.login || "github";
    });
  }

  function commitMessage(verb, title) {
    var clean = String(title || "").replace(/\s+/g, " ").trim().slice(0, 72);
    return verb + ": " + clean;
  }

  function upsertCatalog(cat, entry) {
    if (!cat.sources) cat.sources = [];
    var index = -1;
    cat.sources.forEach(function (item, i) {
      if (item && item.file === entry.file) index = i;
    });
    var prev = index >= 0 ? cat.sources[index] : {};
    var next = Object.assign({}, prev, entry, {
      file: entry.file,
      createdAt: prev.createdAt || entry.createdAt
    });
    if (index >= 0) cat.sources[index] = next;
    else cat.sources.push(next);
    if (next.featured) {
      cat.sources.forEach(function (item) {
        if (item.file !== next.file) item.featured = false;
      });
    }
    cat.version = 1;
  }

  function saveCatalog(mutator) {
    var path = contentsPath("library.json");
    function once() {
      var sha = null;
      var cat = { version: 1, sources: [] };
      return gh(path + "?ref=" + encodeURIComponent(CONFIG.branch)).then(function (cur) {
        sha = cur.sha;
        try { cat = JSON.parse(base64ToText(cur.content)); } catch (e) { cat = { version: 1, sources: [] }; }
      }).catch(function (err) {
        if (err.status !== 404) throw err;
      }).then(function () {
        mutator(cat);
        var body = {
          message: "به‌روزرسانی فهرست کتابخانه",
          content: textToBase64(JSON.stringify(cat, null, 2) + "\n"),
          branch: CONFIG.branch
        };
        if (sha) body.sha = sha;
        return gh(path, { method: "PUT", body: body });
      });
    }
    return once().catch(function (err) {
      if (err.status !== 409) throw err;
      return once();
    });
  }

  function localJson(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new ApiError(data.error || "خطای سرور محلی", res.status, data);
        return data;
      });
    });
  }

  function normalize(src) {
    var filename = src.filename;
    return {
      filename: filename,
      title: String(src.title || "").trim() || prettyName(filename),
      description: src.description || "",
      subject: src.subject || "",
      featured: !!src.featured,
      size: src.size || 0,
      sha: src.sha || null,
      createdAt: src.createdAt || null,
      updatedAt: src.updatedAt || null,
      downloadUrl: src.downloadUrl || null,
      binary: src.binary != null ? !!src.binary : isBinaryName(filename),
      href: openHref(filename)
    };
  }

  function listGitHub() {
    return gh("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/contents/" + CONFIG.dir + "?ref=" + encodeURIComponent(CONFIG.branch))
      .then(function (items) {
        if (!Array.isArray(items)) return [];
        return gh("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/contents/" + CONFIG.dir + "/library.json?ref=" + encodeURIComponent(CONFIG.branch))
          .then(function (file) {
            try { return JSON.parse(base64ToText(file.content)).sources || []; }
            catch (e) { return []; }
          })
          .catch(function (err) {
            if (err.status !== 404) console.warn(err);
            return [];
          })
          .then(function (catalog) {
            var meta = {};
            catalog.forEach(function (item) { if (item && item.file) meta[item.file] = item; });
            return items.filter(function (item) {
              return item.type === "file" && item.name !== "library.json" && item.name.charAt(0) !== ".";
            }).map(function (item) {
              var info = meta[item.name] || {};
              return normalize({
                filename: item.name,
                title: info.title,
                description: info.description || "",
                subject: info.subject || "",
                featured: !!info.featured,
                size: item.size,
                sha: item.sha,
                createdAt: info.createdAt || null,
                updatedAt: info.updatedAt || null,
                downloadUrl: item.download_url,
                binary: isBinaryName(item.name)
              });
            });
          });
      })
      .catch(function (err) {
        if (err.status === 404) return [];
        throw err;
      });
  }

  function listSources() {
    if (mode === "local") {
      return localJson("/api/sources", { cache: "no-store" }).then(function (data) {
        return (data.sources || []).map(normalize);
      });
    }
    return listGitHub();
  }

  function readSource(filename) {
    if (mode === "local") {
      return localJson("/api/sources?name=" + encodeURIComponent(filename), { cache: "no-store" });
    }
    return gh(contentsPath(filename) + "?ref=" + encodeURIComponent(CONFIG.branch)).then(function (data) {
      var known = null;
      sources.forEach(function (item) { if (item.filename === filename) known = item; });
      var record = {
        filename: filename,
        sha: data.sha,
        size: data.size,
        binary: isBinaryName(filename),
        downloadUrl: data.download_url,
        title: known ? known.title : prettyName(filename),
        description: known ? known.description : "",
        subject: known ? known.subject : "",
        featured: known ? known.featured : false,
        createdAt: known ? known.createdAt : null
      };
      if (!record.binary && data.content) record.text = base64ToText(data.content);
      return record;
    });
  }

  function saveGitHub(payload, replace) {
    var filename = payload.filename;
    var sha = payload.sha || null;
    var lookup = Promise.resolve();
    if (replace && !sha) {
      lookup = gh(contentsPath(filename) + "?ref=" + encodeURIComponent(CONFIG.branch)).then(function (cur) {
        sha = cur.sha;
      }).catch(function (err) {
        if (err.status !== 404) throw err;
      });
    } else if (!replace) {
      lookup = gh(contentsPath(filename) + "?ref=" + encodeURIComponent(CONFIG.branch)).then(function () {
        throw new ApiError("فایلی با این نام وجود دارد", 409);
      }).catch(function (err) {
        if (err.status !== 404) throw err;
      });
    }
    return lookup.then(function () {
      var hasContent = payload.text != null || payload.contentBase64;
      if (!hasContent && !replace) throw new ApiError("محتوای فایل خالی است", 400);
      var write = Promise.resolve();
      if (hasContent) {
        var body = {
          message: commitMessage(replace ? "ویرایش منبع" : "افزودن منبع", payload.title || filename),
          content: payload.text != null ? textToBase64(payload.text) : payload.contentBase64,
          branch: CONFIG.branch
        };
        if (sha) body.sha = sha;
        write = gh(contentsPath(filename), { method: "PUT", body: body });
      }
      return write.then(function () {
        var now = new Date().toISOString();
        return saveCatalog(function (cat) {
          upsertCatalog(cat, {
            file: filename,
            title: payload.title || filename,
            description: payload.description || "",
            subject: payload.subject || "",
            featured: !!payload.featured,
            updatedAt: now,
            createdAt: payload.createdAt || now
          });
        }).catch(function () {
          toast("فایل ذخیره شد، ولی فهرست عنوان‌ها کامل به‌روز نشد.");
        });
      });
    });
  }

  function persist(payload, replace) {
    if (mode === "local") {
      return localJson("/api/sources", {
        method: replace ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    return saveGitHub(payload, replace);
  }

  function removeRemote(src) {
    if (mode === "local") {
      return localJson("/api/sources?name=" + encodeURIComponent(src.filename), { method: "DELETE" });
    }
    var shaPromise = src.sha
      ? Promise.resolve(src.sha)
      : gh(contentsPath(src.filename) + "?ref=" + encodeURIComponent(CONFIG.branch)).then(function (cur) { return cur.sha; });
    return shaPromise.then(function (sha) {
      return gh(contentsPath(src.filename), {
        method: "DELETE",
        body: {
          message: commitMessage("حذف منبع", src.title || src.filename),
          sha: sha,
          branch: CONFIG.branch
        }
      });
    }).then(function () {
      return saveCatalog(function (cat) {
        cat.sources = (cat.sources || []).filter(function (item) { return item.file !== src.filename; });
      }).catch(function () {});
    });
  }

  function ensureAuth(next) {
    if (mode === "local" || token) {
      next();
      return;
    }
    afterAuth = next;
    openSettings();
    toast("برای ذخیره در کتابخانه، یک بار گیت‌هاب را وصل کن تا لازم نباشد دستی پوش کنی.");
  }

  function renderMode() {
    var label = modeChip.querySelector("span:last-child");
    var dot = modeChip.querySelector(".dot");
    settingsLocal.hidden = mode !== "local";
    settingsGitHub.hidden = mode === "local";
    if (mode === "local") {
      label.textContent = "سرور محلی";
      dot.classList.add("ok");
      return;
    }
    if (userLogin) {
      label.textContent = "متصل به @" + userLogin;
      dot.classList.add("ok");
      tokenStatus.textContent = "متصل به @" + userLogin + ". منبع جدید مستقیم در مخزن main ذخیره می‌شود.";
      return;
    }
    dot.classList.remove("ok");
    if (token) {
      label.textContent = "توکن ذخیره‌شده";
      tokenStatus.textContent = "توکن ذخیره شده، ولی هنوز اتصال تأیید نشده.";
      return;
    }
    label.textContent = "فقط مشاهده";
    tokenStatus.textContent = "فهرست از مخزن عمومی خوانده می‌شود. برای + و ویرایش، یک بار توکن را وارد کن.";
  }

  function visibleSources() {
    var q = norm(query);
    var list = sources.filter(function (item) {
      if (kindFilter !== "all" && kindOf(item.filename) !== kindFilter) return false;
      if (!q) return true;
      return norm([item.title, item.description, item.subject, item.filename].join(" ")).indexOf(q) !== -1;
    });
    list.sort(function (a, b) {
      if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
      if (sortKey === "name") return a.title.localeCompare(b.title, "fa");
      if (sortKey === "largest") return (b.size || 0) - (a.size || 0);
      return timeOf(b) - timeOf(a);
    });
    return list;
  }

  function renderFilters() {
    var counts = { all: sources.length };
    sources.forEach(function (item) {
      var kind = kindOf(item.filename);
      counts[kind] = (counts[kind] || 0) + 1;
    });
    filters.innerHTML = "";
    ["all", "lesson", "document", "note", "image", "file"].forEach(function (key) {
      if (key !== "all" && !counts[key]) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter";
      btn.setAttribute("aria-pressed", kindFilter === key ? "true" : "false");
      btn.textContent = KIND_LABEL[key] + " " + faNum(counts[key] || 0);
      btn.addEventListener("click", function () {
        kindFilter = key;
        applyFilters();
      });
      filters.appendChild(btn);
    });
  }

  function createCard(item, index) {
    var kind = kindOf(item.filename);
    var card = document.createElement("article");
    card.className = "card" + (item.featured ? " featured" : "");
    card.dataset.filename = item.filename;
    card.style.setProperty("--spine", "var(--spine-" + kind + ")");

    var hit = document.createElement("a");
    hit.className = "card-hit";
    hit.href = item.href;
    hit.target = "_blank";
    hit.rel = "noopener";
    hit.tabIndex = -1;
    hit.setAttribute("aria-hidden", "true");
    card.appendChild(hit);

    var spine = document.createElement("div");
    spine.className = "spine";
    spine.setAttribute("aria-hidden", "true");
    var num = document.createElement("span");
    num.className = "call-no";
    num.textContent = faNum(String(index + 1).padStart(2, "0"));
    var mark = document.createElement("span");
    mark.className = "spine-mark";
    mark.textContent = KIND_LABEL[kind];
    spine.appendChild(num);
    spine.appendChild(mark);
    card.appendChild(spine);

    var main = document.createElement("div");
    main.className = "card-main";
    var kicker = document.createElement("div");
    kicker.className = "card-kicker";
    var extChip = document.createElement("span");
    extChip.className = "chip";
    extChip.dir = "ltr";
    extChip.textContent = (extOf(item.filename) || "file").toUpperCase();
    kicker.appendChild(extChip);
    if (item.subject) {
      var subject = document.createElement("span");
      subject.className = "chip quiet";
      subject.textContent = item.subject;
      kicker.appendChild(subject);
    }
    if (item.featured) {
      var flag = document.createElement("span");
      flag.className = "chip flag";
      flag.textContent = "منبع شاخص";
      kicker.appendChild(flag);
    }
    main.appendChild(kicker);

    var title = document.createElement("h2");
    title.className = "card-title";
    var titleLink = document.createElement("a");
    titleLink.href = item.href;
    titleLink.target = "_blank";
    titleLink.rel = "noopener";
    titleLink.textContent = item.title;
    title.appendChild(titleLink);
    main.appendChild(title);

    if (item.description) {
      var desc = document.createElement("p");
      desc.className = "card-desc";
      desc.textContent = item.description;
      main.appendChild(desc);
    }

    var meta = document.createElement("p");
    meta.className = "card-meta";
    [formatSize(item.size), formatDate(item.updatedAt || item.createdAt)].forEach(function (bit) {
      if (!bit) return;
      var span = document.createElement("span");
      span.textContent = bit;
      meta.appendChild(span);
    });
    var name = document.createElement("span");
    name.className = "filename";
    name.textContent = item.filename;
    meta.appendChild(name);
    main.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "card-actions";
    var open = document.createElement("a");
    open.className = "btn btn-primary";
    open.href = item.href;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "باز کردن";
    open.title = "نمایش در تب جدید";
    var download = document.createElement("button");
    download.className = "btn";
    download.type = "button";
    download.dataset.action = "download";
    download.textContent = "دانلود";
    var edit = document.createElement("button");
    edit.className = "btn";
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.textContent = "ویرایش";
    actions.appendChild(open);
    actions.appendChild(download);
    actions.appendChild(edit);
    main.appendChild(actions);
    card.appendChild(main);
    return card;
  }

  function applyFilters() {
    renderFilters();
    var list = visibleSources();
    statCount.textContent = faNum(sources.length) + " منبع";
    document.title = sources.length ? "کتابخانهٔ آنلاین (" + faNum(sources.length) + ")" : "کتابخانهٔ آنلاین";
    grid.innerHTML = "";
    if (!sources.length) {
      empty.hidden = false;
      emptyTitle.textContent = "هنوز منبعی این‌جا نیست";
      emptyText.textContent = "با دکمهٔ + اولین منبع را اضافه کن. لازم نیست دستی فایلی را داخل مخزن پوش کنی.";
      document.getElementById("emptyAdd").hidden = false;
      return;
    }
    if (!list.length) {
      empty.hidden = false;
      emptyTitle.textContent = "چیزی پیدا نشد";
      emptyText.textContent = "عبارت جستجو یا فیلتر را عوض کن.";
      document.getElementById("emptyAdd").hidden = true;
      return;
    }
    empty.hidden = true;
    var frag = document.createDocumentFragment();
    list.forEach(function (item, index) { frag.appendChild(createCard(item, index)); });
    grid.appendChild(frag);
  }

  function showError(message) {
    banner.hidden = false;
    banner.textContent = "";
    banner.append(document.createTextNode(message + " "));
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "تلاش دوباره";
    btn.addEventListener("click", function () { refresh(); });
    banner.appendChild(btn);
  }

  function refresh() {
    banner.hidden = true;
    statCount.textContent = "در حال خواندن قفسه‌ها…";
    return listSources().then(function (list) {
      sources = list;
      applyFilters();
    }).catch(function (err) {
      sources = [];
      applyFilters();
      showError(err.message || "خواندن کتابخانه ناموفق بود");
    });
  }

  function findSource(filename) {
    for (var i = 0; i < sources.length; i++) {
      if (sources[i].filename === filename) return sources[i];
    }
    return null;
  }

  function downloadSource(item) {
    var url = item.downloadUrl || ("sources/" + encodeURIComponent(item.filename));
    if (mode === "local") url = "sources/" + encodeURIComponent(item.filename);
    fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("download");
      return res.blob();
    }).then(function (blob) {
      var href = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = href;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(href); }, 1500);
    }).catch(function () {
      toast("دانلود انجام نشد", true);
    });
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractMeta(filename, text) {
    var ext = extOf(filename);
    var title = "";
    var description = "";
    if (ext === "html" || ext === "htm") {
      var foundTitle = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (foundTitle) title = cleanText(foundTitle[1]).slice(0, 180);
      var foundP = text.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (foundP) description = cleanText(foundP[1]).slice(0, 180);
    } else if (ext === "md" || ext === "markdown" || ext === "txt") {
      var heading = text.match(/^#\s+(.+)$/m);
      if (heading) title = heading[1].trim().slice(0, 180);
    }
    return { title: title, description: description };
  }

  function acceptFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) {
      toast("حجم فایل بیشتر از ۸ مگابایت است", true);
      return;
    }
    pickedFile = file;
    fileInfo.hidden = false;
    fileInfo.textContent = file.name + " · " + formatSize(file.size);
    if (!isBinaryName(file.name) && file.size < 1500000) {
      file.text().then(function (text) {
        var meta = extractMeta(file.name, text);
        if (meta.title && !addTitle.value.trim()) addTitle.value = meta.title;
        if (meta.description && !addDescription.value.trim()) addDescription.value = meta.description;
        if (!addTitle.value.trim()) addTitle.value = prettyName(file.name);
      });
    } else if (!addTitle.value.trim()) {
      addTitle.value = prettyName(file.name);
    }
  }

  function setAddTab(which) {
    var upload = which === "upload";
    uploadPane.hidden = !upload;
    writePane.hidden = upload;
    tabUpload.setAttribute("aria-selected", upload ? "true" : "false");
    tabWrite.setAttribute("aria-selected", upload ? "false" : "true");
    addSubmit.textContent = upload ? "افزودن به کتابخانه" : "ادامه و نوشتن";
  }

  function openAdd(preset) {
    addForm.reset();
    pickedFile = null;
    fileInfo.hidden = true;
    fileInfo.textContent = "";
    setAddTab("upload");
    openModal(modalAdd);
    if (preset && preset.file) acceptFile(preset.file);
    else addTitle.focus();
  }

  function openSettings() {
    tokenInput.value = "";
    tokenInput.type = "password";
    document.getElementById("tokenToggle").textContent = "نمایش";
    renderMode();
    openModal(modalSettings);
    if (mode !== "local") tokenInput.focus();
  }

  function updateCount() {
    editCount.textContent = editContent.hidden ? "" : faNum(editContent.value.length) + " نویسه";
  }

  function openEditor(state) {
    editing = state;
    pendingBytes = null;
    editReplace.value = "";
    editHeading.textContent = state.mode === "create" ? "منبع جدید" : "ویرایش منبع";
    editTitle.value = state.title || "";
    editSubject.value = state.subject || "";
    editDescription.value = state.description || "";
    editFilename.value = state.filename || "";
    editFilename.readOnly = state.mode !== "create";
    filenameHelp.textContent = state.mode === "create"
      ? "نام فایل در لینک استفاده می‌شود و بعد از ساختن ثابت می‌ماند."
      : "نام فایل ثابت است تا لینک قبلی نشکند.";
    editFeatured.checked = !!state.featured;
    editDelete.hidden = state.mode === "create";
    replaceRow.hidden = state.mode === "create";
    editBinaryNote.hidden = !state.binary;
    editContent.hidden = !!state.binary;
    editContent.value = state.text || "";
    editDirBtn.hidden = !!state.binary;
    editWrapBtn.hidden = !!state.binary;
    editPreview.hidden = !!state.binary;
    var rtl = !state.binary && (extOf(state.filename) === "md" || extOf(state.filename) === "txt");
    editContent.dir = rtl ? "rtl" : "ltr";
    editContent.wrap = rtl ? "soft" : "off";
    editDirBtn.textContent = rtl ? "چپ‌چین" : "راست‌چین";
    editWrapBtn.textContent = rtl ? "بدون شکست خط" : "شکستن خط";
    updateCount();
    editing.baselineText = editContent.value;
    editing.baseline = state.mode === "create" ? "" : snapshot();
    editSave.textContent = state.mode === "create" ? "افزودن به کتابخانه" : "ذخیرهٔ تغییرات";
    openModal(modalEdit);
    editTitle.focus();
  }

  function fillTemplate(tpl, data, shouldEscape) {
    return tpl.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      var value = data[key] || "";
      return shouldEscape ? escapeHtml(value) : value;
    });
  }

  function draftFromFormat(format, fields) {
    var data = {
      TITLE: fields.title || "منبع جدید",
      DESCRIPTION: fields.description || "",
      SUBJECT: fields.subject || "درس",
      DATE: ""
    };
    try {
      data.DATE = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date());
    } catch (e) {
      data.DATE = "";
    }
    if (format === "md") {
      return fetch("templates/note.md", { cache: "no-store" }).then(function (res) {
        return res.ok ? res.text() : "# {{TITLE}}\n\n{{DESCRIPTION}}\n";
      }).catch(function () {
        return "# {{TITLE}}\n\n{{DESCRIPTION}}\n";
      }).then(function (tpl) {
        return {
          text: fillTemplate(tpl, data, false),
          filename: uniqueName(slugify(data.TITLE, "md")),
          binary: false
        };
      });
    }
    if (format === "txt") {
      return Promise.resolve({
        text: data.TITLE + "\n\n" + data.DESCRIPTION + "\n",
        filename: uniqueName(slugify(data.TITLE, "txt")),
        binary: false
      });
    }
    return fetch("templates/lesson.html", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("template");
      return res.text();
    }).catch(function () {
      return "<!DOCTYPE html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"UTF-8\"><title>{{TITLE}}</title></head><body><h1>{{TITLE}}</h1><p>{{DESCRIPTION}}</p></body></html>";
    }).then(function (tpl) {
      return {
        text: fillTemplate(tpl, data, true),
        filename: uniqueName(slugify(data.TITLE, "html")),
        binary: false
      };
    });
  }

  function savePayload(payload, replace) {
    return persist(payload, replace).then(function () {
      return refresh();
    }).then(function () {
      if (mode === "github") {
        toast(replace ? "تغییرها در مخزن ذخیره شد." : "منبع به مخزن اضافه شد. اگر لینک چند لحظه باز نشد، کمی بعد دوباره بزن.");
      } else {
        toast(replace ? "تغییرها ذخیره شد." : "منبع به کتابخانه اضافه شد.");
      }
    });
  }

  function submitUpload() {
    if (!pickedFile) {
      toast("اول یک فایل انتخاب کن", true);
      return;
    }
    var file = pickedFile;
    if (!isSafeName(file.name) && !addTitle.value.trim()) {
      toast("برای این فایل یک عنوان بنویس تا نام امن ساخته شود", true);
      return;
    }
    var filename = isSafeName(file.name) ? uniqueName(file.name) : uniqueName(slugify(addTitle.value.trim() || file.name, extOf(file.name) || "txt"));
    ensureAuth(function () {
      setBusy(addSubmit, true);
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        var payload = {
          filename: filename,
          title: addTitle.value.trim() || prettyName(filename),
          description: addDescription.value.trim(),
          subject: addSubject.value.trim(),
          featured: false
        };
        if (isBinaryName(filename)) payload.contentBase64 = bytesToBase64(bytes);
        else payload.text = new TextDecoder("utf-8").decode(bytes);
        return savePayload(payload, false);
      }).then(function () {
        closeModal(modalAdd);
      }).catch(function (err) {
        toast(err.message || "افزودن منبع ناموفق بود", true);
      }).then(function () {
        setBusy(addSubmit, false);
      });
    });
  }

  function submitWrite() {
    var format = "lesson";
    var selected = addForm.querySelector('input[name="format"]:checked');
    if (selected) format = selected.value;
    var fields = {
      title: addTitle.value.trim(),
      description: addDescription.value.trim(),
      subject: addSubject.value.trim()
    };
    if (!fields.title) {
      toast("برای منبع جدید یک عنوان بنویس", true);
      return;
    }
    setBusy(addSubmit, true);
    draftFromFormat(format, fields).then(function (draft) {
      closeModal(modalAdd);
      openEditor({
        mode: "create",
        filename: draft.filename,
        title: fields.title,
        description: fields.description,
        subject: fields.subject,
        featured: false,
        binary: false,
        text: draft.text,
        sha: null,
        createdAt: null
      });
    }).catch(function () {
      toast("ساخت قالب ناموفق بود", true);
    }).then(function () {
      setBusy(addSubmit, false);
    });
  }

  function submitEdit(event) {
    event.preventDefault();
    if (!editing) return;
    var filename = editing.mode === "create" ? editFilename.value.trim() : editing.filename;
    if (editing.mode === "create") {
      if (!isSafeName(filename)) filename = slugify(editTitle.value.trim() || filename, extOf(filename) || "html");
      filename = uniqueName(filename);
    }
    var payload = {
      filename: filename,
      title: editTitle.value.trim() || prettyName(filename),
      description: editDescription.value.trim(),
      subject: editSubject.value.trim(),
      featured: editFeatured.checked,
      sha: editing.sha,
      createdAt: editing.createdAt
    };
    if (pendingBytes) payload.contentBase64 = bytesToBase64(pendingBytes);
    else if (!editing.binary && (editing.mode === "create" || editContent.value !== editing.baselineText)) {
      payload.text = editContent.value;
    }
    ensureAuth(function () {
      setBusy(editSave, true);
      savePayload(payload, editing.mode !== "create").then(function () {
        editing.baseline = snapshot();
        closeModal(modalEdit);
        editing = null;
      }).catch(function (err) {
        toast(err.message || "ذخیره ناموفق بود", true);
      }).then(function () {
        setBusy(editSave, false);
      });
    });
  }

  function startEdit(item) {
    ensureAuth(function () {
      toast("در حال باز کردن منبع برای ویرایش…");
      readSource(item.filename).then(function (record) {
        openEditor({
          mode: "edit",
          filename: item.filename,
          title: record.title || item.title,
          description: record.description || item.description,
          subject: record.subject || item.subject,
          featured: record.featured != null ? record.featured : item.featured,
          binary: record.binary != null ? record.binary : item.binary,
          text: record.text || "",
          sha: record.sha || item.sha,
          createdAt: record.createdAt || item.createdAt
        });
      }).catch(function (err) {
        toast(err.message || "باز کردن ویرایش ناموفق بود", true);
      });
    });
  }

  function deleteEditing() {
    if (!editing || editing.mode !== "edit") return;
    var item = findSource(editing.filename) || { filename: editing.filename, title: editTitle.value, sha: editing.sha };
    askConfirm({
      title: "حذف منبع",
      text: mode === "github" ? "این منبع از کتابخانه و از مخزن حذف می‌شود." : "این منبع از کتابخانه حذف می‌شود.",
      confirmLabel: "حذف",
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      ensureAuth(function () {
        setBusy(editDelete, true);
        removeRemote(item).then(function () {
          editing.baseline = snapshot();
          closeModal(modalEdit);
          editing = null;
          return refresh();
        }).then(function () {
          toast("منبع حذف شد");
        }).catch(function (err) {
          toast(err.message || "حذف ناموفق بود", true);
        }).then(function () {
          setBusy(editDelete, false);
        });
      });
    });
  }

  function detectMode() {
    return fetch("/api/health", { cache: "no-store" }).then(function (res) {
      if (!res.ok) return "github";
      return res.json().then(function (data) {
        return data && data.ok && data.service === "online-library" ? "local" : "github";
      }).catch(function () { return "github"; });
    }).catch(function () { return "github"; });
  }

  document.getElementById("addBtn").addEventListener("click", function () { openAdd(); });
  document.getElementById("fab").addEventListener("click", function () { openAdd(); });
  document.getElementById("emptyAdd").addEventListener("click", function () { openAdd(); });
  modeChip.addEventListener("click", openSettings);
  document.getElementById("themeBtn").addEventListener("click", function () {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("online_library_theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("online_library_theme", "dark");
    }
  });
  searchInput.addEventListener("input", function () {
    query = searchInput.value;
    applyFilters();
  });
  sortSelect.addEventListener("change", function () {
    sortKey = sortSelect.value;
    applyFilters();
  });
  tabUpload.addEventListener("click", function () { setAddTab("upload"); });
  tabWrite.addEventListener("click", function () { setAddTab("write"); });
  document.getElementById("pickFile").addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) acceptFile(fileInput.files[0]);
  });
  addForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (writePane.hidden) submitUpload();
    else submitWrite();
  });
  editForm.addEventListener("submit", submitEdit);
  editDelete.addEventListener("click", deleteEditing);
  editContent.addEventListener("input", updateCount);
  editContent.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    event.preventDefault();
    var start = editContent.selectionStart;
    var end = editContent.selectionEnd;
    editContent.value = editContent.value.slice(0, start) + "  " + editContent.value.slice(end);
    editContent.selectionStart = editContent.selectionEnd = start + 2;
    updateCount();
  });
  editDirBtn.addEventListener("click", function () {
    var rtl = editContent.dir !== "rtl";
    editContent.dir = rtl ? "rtl" : "ltr";
    editDirBtn.textContent = rtl ? "چپ‌چین" : "راست‌چین";
  });
  editWrapBtn.addEventListener("click", function () {
    var wrap = editContent.wrap === "off";
    editContent.wrap = wrap ? "soft" : "off";
    editWrapBtn.textContent = wrap ? "بدون شکست خط" : "شکستن خط";
  });
  editPreview.addEventListener("click", function () {
    var ext = extOf(editFilename.value);
    var type = ext === "html" || ext === "htm" ? "text/html" : "text/plain";
    var blob = new Blob([editContent.value], { type: type + ";charset=utf-8" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  });
  editReplace.addEventListener("change", function () {
    var file = editReplace.files && editReplace.files[0];
    if (!file || !editing) return;
    if (file.size > MAX_FILE) {
      toast("حجم فایل بیشتر از ۸ مگابایت است", true);
      editReplace.value = "";
      return;
    }
    if (extOf(file.name) !== extOf(editing.filename)) {
      toast("پسوند فایل جدید باید ." + extOf(editing.filename) + " باشد", true);
      editReplace.value = "";
      return;
    }
    if (isBinaryName(file.name)) {
      file.arrayBuffer().then(function (buf) {
        pendingBytes = new Uint8Array(buf);
        toast("فایل جایگزین آمادهٔ ذخیره است");
      });
      return;
    }
    file.text().then(function (text) {
      editContent.hidden = false;
      editContent.value = text;
      updateCount();
      toast("متن فایل در ویرایشگر جایگزین شد");
    });
  });

  document.getElementById("tokenToggle").addEventListener("click", function () {
    var show = tokenInput.type === "password";
    tokenInput.type = show ? "text" : "password";
    this.textContent = show ? "پنهان" : "نمایش";
  });
  document.getElementById("tokenSave").addEventListener("click", function () {
    var value = tokenInput.value.trim();
    var btn = document.getElementById("tokenSave");
    if (value.length < 20) {
      toast("توکن را کامل بچسبان", true);
      return;
    }
    setBusy(btn, true);
    verifyToken(value).then(function (login) {
      token = value;
      userLogin = login;
      localStorage.setItem(TOKEN_KEY, token);
      tokenInput.value = "";
      renderMode();
      toast("وصل شدی به @" + login);
      var next = afterAuth;
      afterAuth = null;
      closeModal(modalSettings);
      if (next) next();
    }).catch(function (err) {
      toast(err.message || "اتصال ناموفق بود", true);
    }).then(function () {
      setBusy(btn, false);
    });
  });
  document.getElementById("tokenForget").addEventListener("click", function () {
    token = "";
    userLogin = "";
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    renderMode();
    toast("توکن از این مرورگر پاک شد");
  });

  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-close");
      if (id === "modalEdit" || id === "modalSettings") closeTop();
      else closeModal(document.getElementById(id));
    });
  });
  document.querySelectorAll(".modal").forEach(function (modal) {
    modal.addEventListener("mousedown", function (event) {
      if (event.target === modal) closeTop();
    });
  });
  grid.addEventListener("click", function (event) {
    var origin = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    var btn = origin && origin.closest("[data-action]");
    if (!btn) return;
    var card = btn.closest("[data-filename]");
    if (!card) return;
    var item = findSource(card.dataset.filename);
    if (!item) return;
    if (btn.dataset.action === "download") downloadSource(item);
    if (btn.dataset.action === "edit") startEdit(item);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeTop();
      return;
    }
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag && /INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      openAdd();
    }
  });

  var dragHideTimer = 0;
  function isFileDrag(event) {
    return event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, "Files") !== -1;
  }
  window.addEventListener("dragover", function (event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dropOverlay.hidden = false;
    clearTimeout(dragHideTimer);
  });
  window.addEventListener("dragleave", function () {
    clearTimeout(dragHideTimer);
    dragHideTimer = setTimeout(function () { dropOverlay.hidden = true; }, 80);
  });
  window.addEventListener("drop", function (event) {
    if (!event.dataTransfer || !event.dataTransfer.files.length) return;
    event.preventDefault();
    clearTimeout(dragHideTimer);
    dropOverlay.hidden = true;
    if (!modalAdd.hidden) acceptFile(event.dataTransfer.files[0]);
    else openAdd({ file: event.dataTransfer.files[0] });
  });

  var dropzone = document.getElementById("dropzone");
  ["dragenter", "dragover"].forEach(function (name) {
    dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (name) {
    dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", function (event) {
    if (event.dataTransfer && event.dataTransfer.files[0]) acceptFile(event.dataTransfer.files[0]);
  });

  try { token = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { token = ""; }
  renderMode();
  detectMode().then(function (detected) {
    mode = detected;
    renderMode();
    if (mode === "github" && token) {
      verifyToken(token).then(function (login) {
        userLogin = login;
        renderMode();
      }).catch(function () {
        renderMode();
      });
    }
    return refresh();
  });
})();
