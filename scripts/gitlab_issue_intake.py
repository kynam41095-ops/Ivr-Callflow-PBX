#!/usr/bin/env python3
"""GitLab issue intake cho Orca: kéo issue open của repo này về và tạo worktree gắn issue.

    --check        Chỉ đọc GitLab + state, in ra issue mới. Exit 0 nếu còn issue chưa lấy, 1 nếu hết.
    --take         Tạo worktree gắn issue kèm agent + prompt lập plan.
    --dry-run      In ra việc sẽ làm, không tạo gì.
    --no-agent     Tạo worktree nhưng không khởi động agent.
    --limit N      Số issue lấy trong một lần (mặc định 1).

Cấu hình qua biến môi trường:
    GITLAB_HOST          mặc định https://gitlab19.mitek.vn
    GITLAB_TOKEN         PAT (scope read_api); hoặc đọc từ GITLAB_TOKEN_FILE
    INTAKE_PROJECT_PATH  mặc định ivr-callflow-pbx/app-business
    INTAKE_REPO_NAME     tên repo đã đăng ký trong Orca, mặc định ivr-callflow-pbx
    INTAKE_API_BASE      ghi đè URL API (dùng cho test)
    INTAKE_STATE_DIR     nơi lưu state, mặc định ~/.local/state/orca-gitlab-intake
    INTAKE_AGENT         agent id, mặc định omp
    INTAKE_BASE_BRANCH   base ref cho worktree mới, mặc định theo repo
"""

from __future__ import annotations

import argparse
import fcntl
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import typing
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_TOKEN_FILE = Path(
    os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
) / "orca-gitlab" / "token"
DEFAULT_CONFIG_FILE = Path(
    os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
) / "orca-gitlab" / "config"


def load_config_file() -> None:
    """Đọc KEY=VALUE từ ~/.config/orca-gitlab/config; biến môi trường đã đặt thì giữ nguyên.

    Precheck của Orca chạy bằng cmd.exe nên không kế thừa cấu hình tuỳ biến; file này là
    đường duy nhất để chỉnh host/đường dẫn state mà không cần sửa script.
    """
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

EXIT_OK_PENDING = 0
EXIT_NO_WORK = 1
EXIT_CONFIG = 2
EXIT_API = 3
EXIT_CREATE = 4
EXIT_ORCA = 5
# Chặn vòng lặp phân trang vô hạn nếu server trả X-Next-Page lạ.
MAX_PAGES = 20


def fail(message: str, code: int) -> typing.NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(code)


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
    """Dùng lại credential của `glab auth login` thay vì bắt người dùng lưu token lần hai."""
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


def api_base() -> str:
    override = os.environ.get("INTAKE_API_BASE")
    if override:
        return override.rstrip("/")
    host = os.environ.get("GITLAB_HOST", "https://gitlab19.mitek.vn").rstrip("/")
    return f"{host}/api/v4"


def fetch_open_issues(token: str) -> list[dict]:
    project = os.environ.get("INTAKE_PROJECT_PATH", "ivr-callflow-pbx/app-business")
    encoded = urllib.parse.quote(project, safe="")
    issues: list[dict] = []
    page = 1
    while page <= MAX_PAGES:
        url = (
            f"{api_base()}/projects/{encoded}/issues"
            f"?state=opened&per_page=100&order_by=created_at&sort=asc&page={page}"
        )
        request = urllib.request.Request(
            url,
            headers={
                "PRIVATE-TOKEN": token,
                "Accept": "application/json",
                "User-Agent": "orca-gitlab-intake",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
                next_page = response.headers.get("X-Next-Page", "")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            fail(f"GitLab API trả về HTTP {error.code}: {detail}", EXIT_API)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            fail(f"Gọi GitLab API thất bại: {error}", EXIT_API)
        if not isinstance(payload, list):
            fail("GitLab trả về dữ liệu không phải danh sách issue.", EXIT_API)
        issues.extend(payload)
        if not next_page.strip() or not payload:
            break
        page = int(next_page) if next_page.strip().isdigit() else page + 1
    return issues


def resolve_orca_cli() -> str | None:
    configured = os.environ.get("ORCA_CLI_COMMAND", "").strip()
    if configured and shutil.which(configured):
        return shutil.which(configured)
    found = shutil.which("orca-ide")
    if found:
        return found
    candidates = [
        *glob.glob(os.path.expanduser("~/.local/bin/orca-ide")),
        *glob.glob("/mnt/c/Users/*/AppData/Roaming/orca/wsl-managed-cli/*/orca-ide"),
    ]
    for candidate in candidates:
        if os.access(candidate, os.X_OK):
            return candidate
    return None


def linked_issue_iids(cli: str, repo_name: str) -> set[int]:
    """Trả về iid đã có worktree gắn issue; lỗi CLI thì dừng, không coi như rỗng.

    Trả set() khi CLI hỏng sẽ khiến lượt này tạo worktree trùng cho issue đang làm.
    """
    try:
        completed = subprocess.run(
            [cli, "worktree", "list", "--repo", f"name:{repo_name}", "--json"],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except (OSError, subprocess.SubprocessError) as error:
        fail(f"Không đọc được danh sách worktree từ Orca CLI: {error}", EXIT_ORCA)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()[:300]
        fail(f"Orca CLI trả exit {completed.returncode}: {detail}", EXIT_ORCA)
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        fail("Orca CLI trả JSON không đọc được cho `worktree list`.", EXIT_ORCA)
    if payload.get("ok") is False:
        message = (payload.get("error") or {}).get("message") or "ok=false"
        fail(f"Orca CLI báo lỗi: {message}", EXIT_ORCA)
    worktrees = (payload.get("result") or {}).get("worktrees")
    if not isinstance(worktrees, list):
        fail("Orca CLI không trả `result.worktrees` cho `worktree list`.", EXIT_ORCA)
    return {
        int(item["linkedGitLabIssue"])
        for item in worktrees
        if isinstance(item, dict) and isinstance(item.get("linkedGitLabIssue"), int)
    }


def load_state(state_dir: Path) -> dict:
    state_file = state_dir / "state.json"
    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"processed": []}
    if not isinstance(state.get("processed"), list):
        state["processed"] = []
    return state


def save_state(state_dir: Path, state: dict) -> None:
    state_file = state_dir / "state.json"
    temp_file = state_dir / f".state.{os.getpid()}.tmp"
    temp_file.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp_file, state_file)


def slugify(title: str, limit: int = 40) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    return slug[:limit].strip("-")


PROMPT_TEMPLATE = Path(__file__).resolve().parent / "prompts" / "issue_main_agent.md"


def build_prompt(issue: dict, template_path: Path | None = None) -> str:
    """Ghép template quy trình (propose → blocker → worker apply → review/test) với nội dung issue."""
    iid = issue["iid"]
    title = (issue.get("title") or "").strip() or "(không có tiêu đề)"
    url = issue.get("web_url") or ""
    description = (issue.get("description") or "").strip() or "(không có mô tả)"

    template = template_path or PROMPT_TEMPLATE
    try:
        text = template.read_text(encoding="utf-8")
    except OSError as error:
        fail(f"Không đọc được prompt template {template}: {error}", EXIT_CONFIG)

    for placeholder, value in (
        ("{{iid}}", str(iid)),
        ("{{title}}", title),
        ("{{url}}", url),
        ("{{description}}", description),
        ("{{note_script}}", str(Path(__file__).resolve().parent / "gitlab_issue_note.py")),
        ("{{scripts_dir}}", str(Path(__file__).resolve().parent)),
    ):
        text = text.replace(placeholder, value)
    return text


def create_worktree(
    cli: str, repo_name: str, issue: dict, base_branch: str | None, agent: str | None
) -> dict:
    iid = issue["iid"]
    slug = slugify(issue.get("title") or "") or "task"
    name = f"issue-{iid}-{slug}"
    command = [
        cli,
        "worktree",
        "create",
        "--repo",
        f"name:{repo_name}",
        "--name",
        name,
        "--gitlab-issue",
        str(iid),
        "--no-parent",
        "--setup",
        os.environ.get("INTAKE_SETUP", "skip"),
        "--json",
    ]
    if base_branch:
        command += ["--base-branch", base_branch]
    if agent:
        command += ["--agent", agent, "--prompt", build_prompt(issue)]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()[:600]
        fail(f"Tạo worktree cho issue #{iid} thất bại (exit {completed.returncode}):\n{detail}", EXIT_CREATE)
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        fail(f"Orca trả về JSON không đọc được khi tạo worktree cho issue #{iid}.", EXIT_CREATE)
    result = payload.get("result") or {}
    return {"name": name, "worktree": result.get("worktree") or {}, "launch": result.get("launch")}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(add_help=True, description="GitLab issue intake cho Orca")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="chỉ kiểm tra issue mới")
    mode.add_argument("--take", action="store_true", help="tạo worktree cho issue mới")
    parser.add_argument("--dry-run", action="store_true", help="in ra, không tạo gì")
    parser.add_argument("--no-agent", action="store_true", help="không khởi động agent")
    parser.add_argument("--limit", type=int, default=1, help="số issue lấy mỗi lần (mặc định 1)")
    args = parser.parse_args(argv)
    load_config_file()

    if args.limit < 1:
        fail("--limit phải >= 1", EXIT_CONFIG)

    token = read_token()
    if not token:
        fail(
            "Chưa có GitLab token. Tạo PAT (scope read_api) và ghi vào "
            f"{DEFAULT_TOKEN_FILE} (chmod 600) hoặc đặt biến GITLAB_TOKEN.",
            EXIT_CONFIG,
        )

    repo_name = os.environ.get("INTAKE_REPO_NAME", "ivr-callflow-pbx")
    state_dir = Path(
        os.environ.get("INTAKE_STATE_DIR", Path.home() / ".local" / "state" / "orca-gitlab-intake")
    ).expanduser()
    state_dir.mkdir(parents=True, exist_ok=True)

    lock_handle = (state_dir / "lock").open("w")
    try:
        fcntl.flock(lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Đã có lượt intake khác đang chạy; bỏ qua.", file=sys.stderr)
        return EXIT_NO_WORK

    cli = resolve_orca_cli()
    if not cli:
        fail("Không tìm thấy orca CLI (orca-ide). Chạy script trong terminal do Orca mở.", EXIT_CONFIG)

    state = load_state(state_dir)
    processed = {int(value) for value in state["processed"]}
    linked = linked_issue_iids(cli, repo_name)

    issues = fetch_open_issues(token)
    pending = [
        issue
        for issue in sorted(issues, key=lambda item: item.get("created_at") or "")
        if isinstance(issue.get("iid"), int)
        and issue.get("state", "opened") == "opened"
        and issue["iid"] not in linked
        and issue["iid"] not in processed
    ]

    if args.check:
        if not pending:
            print("Không có issue mới (đã lấy hoặc không còn issue open).")
            return EXIT_NO_WORK
        for issue in pending:
            print(f"issue #{issue['iid']}: {issue.get('title') or ''}")
        print(f"Có {len(pending)} issue chờ lấy.")
        return EXIT_OK_PENDING

    if not pending:
        print("Không có issue mới để lấy.")
        return EXIT_NO_WORK

    agent = None if args.no_agent else os.environ.get("INTAKE_AGENT", "omp")
    base_branch = os.environ.get("INTAKE_BASE_BRANCH") or None
    created: list[dict] = []

    for issue in pending[: args.limit]:
        iid = issue["iid"]
        if args.dry_run:
            slug = slugify(issue.get("title") or "") or "task"
            print(
                f"DRY-RUN: issue #{iid} -> worktree 'issue-{iid}-{slug}'"
                f"{' (agent ' + agent + ')' if agent else ''}"
            )
            created.append({"iid": iid, "dryRun": True})
            continue

        result = create_worktree(cli, repo_name, issue, base_branch, agent)
        worktree = result["worktree"]
        record = {
            "iid": iid,
            "title": issue.get("title") or "",
            "description": issue.get("description") or "",
            "url": issue.get("web_url") or "",
            "worktree": result["name"],
            "worktreeId": worktree.get("id"),
            "path": worktree.get("path"),
            "linkedGitLabIssue": worktree.get("linkedGitLabIssue"),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        created.append(record)

        state["processed"] = sorted({*processed, iid})
        save_state(state_dir, state)
        (state_dir / "last-run.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Đã tạo worktree '{result['name']}' cho issue #{iid}")
        print(f"  Subject: {record['title']}")
        description = (issue.get("description") or "").strip()
        print(f"  Description: {description or '(không có mô tả)'}")
        print(f"  {record['url']}")

    if not created:
        print("Không tạo worktree nào.")
        return EXIT_NO_WORK

    print(f"Hoàn tất: xử lý {len(created)} issue.")
    return EXIT_OK_PENDING


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
