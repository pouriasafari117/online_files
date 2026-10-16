#!/usr/bin/env python3
"""Local server for the online library.

Lists, serves, creates, updates and deletes files in ./sources.
Static pages (the panel) are served from the repository root.
No third-party packages required.
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import traceback
from datetime import datetime, timezone
from html import unescape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
SOURCES = ROOT / "sources"
CATALOG = SOURCES / "library.json"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8080"))
MAX_FILE = 8 * 1024 * 1024
MAX_BODY = 16 * 1024 * 1024
LOCK = threading.Lock()

TEXT_EXT = {".html", ".htm", ".md", ".markdown", ".txt", ".csv", ".json", ".svg"}
BLOCKED_EXT = {
    ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".scr",
    ".ps1", ".sh", ".bash", ".app", ".dmg", ".so", ".dylib",
}
RESERVED = {"library.json"}
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
H1_RE = re.compile(r"^#\s+(.+)$", re.M)
TAG_RE = re.compile(r"<[^>]+>")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def file_mtime(path: Path) -> str:
    stamp = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(microsecond=0)
    return stamp.isoformat().replace("+00:00", "Z")


def clean_name(name: str) -> str:
    name = unquote(name or "").replace("\x00", "").strip()
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name or name.startswith(".") or ".." in name or "/" in name or "\\" in name or len(name) > 140:
        raise ValueError("نام فایل معتبر نیست")
    if name.lower() in RESERVED:
        raise ValueError("این نام رزرو شده است")
    if not re.fullmatch(r"[^\\/:*?\"<>|\x00-\x1f]+", name):
        raise ValueError("نام فایل معتبر نیست")
    ext = Path(name).suffix.lower()
    if not ext or len(ext) > 12 or ext in BLOCKED_EXT:
        raise ValueError("پسوند فایل مجاز نیست")
    return name


def read_catalog() -> dict:
    if not CATALOG.exists():
        return {"version": 1, "sources": []}
    try:
        data = json.loads(CATALOG.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "sources": []}
    if not isinstance(data, dict):
        return {"version": 1, "sources": []}
    data.setdefault("version", 1)
    if not isinstance(data.get("sources"), list):
        data["sources"] = []
    return data


def write_catalog(data: dict) -> None:
    SOURCES.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    CATALOG.write_text(text, "utf-8")


def extract_title(name: str, data: bytes) -> str:
    ext = Path(name).suffix.lower()
    if ext not in TEXT_EXT:
        return Path(name).stem.replace("-", " ").replace("_", " ")
    text = data.decode("utf-8", "replace")
    if ext in {".html", ".htm"}:
        match = TITLE_RE.search(text)
        if match:
            raw = TAG_RE.sub("", match.group(1))
            title = re.sub(r"\s+", " ", unescape(raw)).strip()
            if title:
                return title[:180]
    else:
        match = H1_RE.search(text)
        if match:
            return match.group(1).strip()[:180]
    return Path(name).stem.replace("-", " ").replace("_", " ")


def is_binary(path: Path) -> bool:
    ext = path.suffix.lower()
    if ext in TEXT_EXT:
        return False
    sample = path.read_bytes()[:4096]
    if b"\x00" in sample:
        return True
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        return True
    return ext not in TEXT_EXT and ext not in {".css", ".js"}


def source_record(path: Path, meta: dict | None = None) -> dict:
    meta = meta or {}
    binary = is_binary(path)
    updated = meta.get("updatedAt") or file_mtime(path)
    created = meta.get("createdAt") or updated
    title = (meta.get("title") or "").strip()
    if not title and not binary:
        title = extract_title(path.name, path.read_bytes()[:200_000])
    if not title:
        title = path.stem.replace("-", " ").replace("_", " ")
    return {
        "filename": path.name,
        "title": title,
        "description": meta.get("description") or "",
        "subject": meta.get("subject") or "",
        "featured": bool(meta.get("featured")),
        "size": path.stat().st_size,
        "createdAt": created,
        "updatedAt": updated,
        "binary": binary,
        "downloadUrl": None,
        "sha": None,
    }


def list_sources() -> list[dict]:
    SOURCES.mkdir(parents=True, exist_ok=True)
    catalog = {item.get("file"): item for item in read_catalog().get("sources", []) if isinstance(item, dict)}
    records = []
    for path in sorted(SOURCES.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file() or path.name.startswith(".") or path.name == "library.json":
            continue
        records.append(source_record(path, catalog.get(path.name)))
    records.sort(key=lambda item: item.get("updatedAt") or "", reverse=True)
    return records


def upsert_meta(filename: str, fields: dict) -> dict:
    with LOCK:
        catalog = read_catalog()
        items = catalog["sources"]
        current = next((item for item in items if item.get("file") == filename), None)
        stamp = now_iso()
        if current is None:
            current = {"file": filename, "createdAt": stamp}
            items.append(current)
        for key in ("title", "description", "subject"):
            if key in fields and fields[key] is not None:
                current[key] = fields[key]
        if "featured" in fields and fields["featured"] is not None:
            featured = bool(fields["featured"])
            current["featured"] = featured
            if featured:
                for item in items:
                    if item is not current:
                        item["featured"] = False
        current["file"] = filename
        current.setdefault("createdAt", stamp)
        current["updatedAt"] = stamp
        write_catalog(catalog)
        return current


def remove_meta(filename: str) -> None:
    with LOCK:
        catalog = read_catalog()
        catalog["sources"] = [item for item in catalog["sources"] if item.get("file") != filename]
        write_catalog(catalog)


def clip(value, limit: int) -> str:
    if value is None:
        return ""
    return str(value).strip()[:limit]


def save_source(payload: dict, replace_ok: bool) -> dict:
    name = clean_name(payload.get("filename") or "")
    SOURCES.mkdir(parents=True, exist_ok=True)
    path = SOURCES / name
    has_text = payload.get("text") is not None
    has_b64 = bool(payload.get("contentBase64"))
    if path.exists() and not replace_ok and (has_text or has_b64):
        raise FileExistsError(name)
    if not path.exists() and not has_text and not has_b64:
        raise ValueError("محتوای فایل خالی است")
    if has_text or has_b64:
        if has_text:
            data = str(payload.get("text")).encode("utf-8")
        else:
            try:
                data = base64.b64decode(payload.get("contentBase64"), validate=True)
            except Exception as exc:
                raise ValueError("محتوای فایل نامعتبر است") from exc
        if len(data) > MAX_FILE:
            raise ValueError("حجم فایل بیشتر از ۸ مگابایت است")
        path.write_bytes(data)
    title = clip(payload.get("title"), 180)
    if not title:
        title = extract_title(name, path.read_bytes()[:200_000]) if path.exists() else Path(name).stem
    meta = upsert_meta(name, {
        "title": title,
        "description": clip(payload.get("description"), 600),
        "subject": clip(payload.get("subject"), 80),
        "featured": payload.get("featured"),
    })
    return source_record(path, meta)


class LibraryHandler(SimpleHTTPRequestHandler):
    server_version = "OnlineLibrary/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def list_directory(self, path):
        self.send_response(302)
        self.send_header("Location", "/")
        self.end_headers()
        return None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.dispatch("GET", parsed)
            return
        super().do_GET()

    def do_POST(self) -> None:
        self.dispatch("POST", urlparse(self.path))

    def do_PUT(self) -> None:
        self.dispatch("PUT", urlparse(self.path))

    def do_DELETE(self) -> None:
        self.dispatch("DELETE", urlparse(self.path))

    def read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length < 0 or length > MAX_BODY:
            raise ValueError("حجم درخواست زیاد است")
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("دادهٔ ارسالی نامعتبر است") from exc
        if not isinstance(data, dict):
            raise ValueError("دادهٔ ارسالی نامعتبر است")
        return data

    def send_json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def dispatch(self, method: str, parsed) -> None:
        try:
            status, payload = self.route(method, parsed)
        except FileNotFoundError:
            status, payload = 404, {"error": "منبع پیدا نشد"}
        except FileExistsError:
            status, payload = 409, {"error": "فایلی با این نام وجود دارد"}
        except ValueError as exc:
            status, payload = 400, {"error": str(exc)}
        except Exception:
            traceback.print_exc()
            status, payload = 500, {"error": "خطای سرور"}
        self.send_json(payload, status)

    def route(self, method: str, parsed):
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)
        if method == "GET" and path == "/api/health":
            return 200, {"ok": True, "service": "online-library", "mode": "local"}
        if path == "/api/sources" and method == "GET":
            name = (query.get("name") or [None])[0]
            if name:
                safe = clean_name(name)
                file_path = SOURCES / safe
                if not file_path.is_file():
                    raise FileNotFoundError(safe)
                catalog = {item.get("file"): item for item in read_catalog().get("sources", []) if isinstance(item, dict)}
                record = source_record(file_path, catalog.get(safe))
                if not record["binary"]:
                    record["text"] = file_path.read_text("utf-8")
                return 200, record
            return 200, {"sources": list_sources()}
        if path == "/api/sources" and method == "POST":
            return 201, save_source(self.read_body(), replace_ok=False)
        if path == "/api/sources" and method == "PUT":
            return 200, save_source(self.read_body(), replace_ok=True)
        if path == "/api/sources" and method == "DELETE":
            name = (query.get("name") or [None])[0]
            safe = clean_name(name or "")
            file_path = SOURCES / safe
            if not file_path.is_file():
                raise FileNotFoundError(safe)
            file_path.unlink()
            remove_meta(safe)
            return 200, {"ok": True}
        return 404, {"error": "مسیر پیدا نشد"}


def main() -> None:
    SOURCES.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer((HOST, PORT), LibraryHandler)
    print(f"Library server on http://{HOST}:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
