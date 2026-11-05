#!/usr/bin/env python3
"""Ghi comment lên GitLab issue, dùng cho bước báo blocker của agent chính.

    --iid N            issue iid (bắt buộc)
    --body-file PATH   đọc nội dung comment từ file (khuyến nghị, tránh shell escaping)
    --body TEXT        nội dung comment trực tiếp
    --mention USER     thêm @USER vào đầu nội dung; mặc định INTAKE_MENTION hoặc
                       username của chính token
    --dry-run          in ra payload, không gửi

Cấu hình giống `gitlab_issue_intake.py`: GITLAB_HOST, GITLAB_TOKEN hoặc credential của
`glab auth login`, và file `~/.config/orca-gitlab/config` (dạng KEY=VALUE).

Exit: 0 đã gửi, 2 thiếu cấu hình, 3 GitLab API lỗi.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import typing
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_CONFIG_FILE = Path(
    os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
) / "orca-gitlab" / "config"
DEFAULT_TOKEN_FILE = Path(
    os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
) / "orca-gitlab" / "token"
DEFAULT_PROJECT_PATH = "ivr-callflow-pbx/app-business"

EXIT_OK = 0
EXIT_CONFIG = 2
EXIT_API = 3


def fail(message: str, code: int) -> typing.NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def load_config_file() -> None:
    config_path = Path(os.environ.get("INTAKE_CONFIG_FILE", DEFAULT_CONFIG_FILE)).expanduser()
    try:
        lines = config_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def api_base() -> str:
    override = os.environ.get("INTAKE_API_BASE")
    if override:
        return override.rstrip("/")
    host = os.environ.get("GITLAB_HOST", "https://gitlab19.mitek.vn").rstrip("/")
    return f"{host}/api/v4"


def read_token() -> str | None:
    token = os.environ.get("GITLAB_TOKEN", "").strip()
    if token:
        return token
    token_file = Path(os.environ.get("GITLAB_TOKEN_FILE", DEFAULT_TOKEN_FILE)).expanduser()
    try:
        token = token_file.read_text(encoding="utf-8").strip()
    except OSError:
        token = ""
    if token:
        return token
    return read_glab_token()


def read_glab_token() -> str | None:
    glab = shutil.which("glab") or os.path.expanduser("~/.local/bin/glab")
    if not os.access(glab, os.X_OK):
        return None
    host = urllib.parse.urlparse(
        os.environ.get("GITLAB_HOST", "https://gitlab19.mitek.vn")
    ).hostname
    if not host:
        return None
    try:
        completed = subprocess.run(
            [glab, "config", "get", "token", "--host", host],
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    token = completed.stdout.strip()
    return token or None


def request_json(url: str, token: str, method: str, body: dict | None) -> object:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("PRIVATE-TOKEN", token)
    request.add_header("Accept", "application/json")
    request.add_header("User-Agent", "orca-gitlab-intake")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        fail(f"GitLab API trả về HTTP {error.code}: {detail}", EXIT_API)
    except (urllib.error.URLError, TimeoutError) as error:
        fail(f"Gọi GitLab API thất bại: {error}", EXIT_API)
    try:
        return json.loads(payload) if payload else {}
    except json.JSONDecodeError:
        return {"raw": payload}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Ghi comment lên GitLab issue")
    parser.add_argument("--iid", type=int, required=True, help="issue iid")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--body", help="nội dung comment")
    source.add_argument("--body-file", help="file chứa nội dung comment")
    parser.add_argument("--mention", help="username cần tag; mặc định INTAKE_MENTION")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    load_config_file()

    if args.body_file:
        try:
            body = Path(args.body_file).expanduser().read_text(encoding="utf-8")
        except OSError as error:
            fail(f"Không đọc được --body-file: {error}", EXIT_CONFIG)
    else:
        body = args.body or ""

    body = body.strip()
    if not body:
        fail("Nội dung comment rỗng.", EXIT_CONFIG)

    token = read_token()
    if not token:
        fail(
            "Chưa có GitLab token. Đăng nhập bằng `glab auth login --hostname <host>`, "
            f"ghi token vào {DEFAULT_TOKEN_FILE}, hoặc đặt GITLAB_TOKEN.",
            EXIT_CONFIG,
        )

    mention = (args.mention or os.environ.get("INTAKE_MENTION", "")).strip().lstrip("@")
    if not mention:
        viewer = request_json(f"{api_base()}/user", token, "GET", None)
        if isinstance(viewer, dict):
            mention = str(viewer.get("username") or "").strip()

    text = f"@{mention} {body}" if mention else body

    project = os.environ.get("INTAKE_PROJECT_PATH", DEFAULT_PROJECT_PATH)
    encoded = urllib.parse.quote(project, safe="")
    url = f"{api_base()}/projects/{encoded}/issues/{args.iid}/notes"

    if args.dry_run:
        print(json.dumps({"url": url, "body": text}, ensure_ascii=False, indent=2))
        return EXIT_OK

    result = request_json(url, token, "POST", {"body": text})
    note_id = result.get("id") if isinstance(result, dict) else None
    print(f"Đã comment lên issue #{args.iid} (note {note_id}).")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
