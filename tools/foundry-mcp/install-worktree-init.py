"""Plan or install this repository's Foundry MCP post-checkout initializer."""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tomllib

# A preview must not leave import caches in the checkout.
sys.dont_write_bytecode = True
from worktree_init import NAMES, write_checked


HELPER_NAME = "codex-foundry-mcp-worktree.py"
HOOK_HEADER = (
    "#!/bin/sh",
    "# Repository-local Foundry MCP initialization; does not change service state.",
    'hook_dir="$(git rev-parse --path-format=absolute --git-common-dir)/hooks"',
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="Existing checkout or worktree")
    parser.add_argument("--apply", action="store_true", help="Install after all checks pass")
    options = parser.parse_args()
    plan = plan_install(options.repo)
    changed = [entry for entry in plan["files"] if entry["before"] != entry["after"]]
    if options.apply:
        for entry in plan["files"]:
            write_checked(entry["path"], entry["before"], entry["after"])
            if entry["path"].read_bytes() != entry["after"]:
                raise RuntimeError("Installed hook failed readback: " + str(entry["path"]))
        hook = plan["files"][-1]["path"]
        hook.chmod(hook.stat().st_mode | 0o111)
    print(json.dumps({
        "applied": options.apply,
        "primaryCheckout": str(plan["primary"]),
        "python": sys.executable,
        "filesToWrite": len(changed),
        "files": [{
            "path": str(entry["path"]),
            "beforeSha256": digest(entry["before"]),
            "afterSha256": digest(entry["after"]),
        } for entry in plan["files"]],
        "existingWorktreesModified": False,
        "serviceRestartRequired": False,
    }, indent=2))


def git(repo, *args):
    return subprocess.check_output(
        ["git", "-C", str(repo), *args], stderr=subprocess.PIPE, text=True, encoding="utf-8"
    ).strip()


def digest(value):
    return hashlib.sha256(value).hexdigest() if value is not None else None


def ordinary(path):
    if path.is_symlink() or path.parent.is_symlink():
        raise RuntimeError("Refusing a linked hook or configuration path: " + str(path))
    if path.exists() and not path.is_file():
        raise RuntimeError("Expected an ordinary file: " + str(path))


def owned_hook(value):
    try:
        lines = value.decode("utf-8").splitlines()
        if len(lines) != 4 or tuple(lines[:3]) != HOOK_HEADER:
            return False
        args = shlex.split(lines[3])
        return (
            len(args) == 6
            and args[0] == "exec"
            and Path(args[1]).name.lower().startswith("python")
            and args[2:] == ["-I", "-B", "$hook_dir/" + HELPER_NAME, "$@"]
        )
    except (UnicodeError, ValueError):
        return False


def plan_install(repo):
    common = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir")).resolve()
    hooks = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-path", "hooks")).resolve()
    if common.name != ".git" or hooks != common / "hooks" or common.is_symlink() or hooks.is_symlink():
        raise RuntimeError("Expected this repository's ordinary .git/hooks; custom hooksPath is not replaced")
    primary = common.parent
    config = primary / ".codex/config.toml"
    ordinary(config)
    data = tomllib.loads(config.read_text(encoding="utf-8-sig"))
    entries = {name: data["mcp_servers"][name] for name in NAMES}
    if entries["foundry"].get("enabled") is not True or any(
        entries[name].get("enabled") is not False for name in NAMES if name != "foundry"
    ):
        raise RuntimeError("Primary configuration must enable foundry and explicitly disable the three legacy entries")
    helper = Path(__file__).with_name("worktree_init.py").read_bytes()
    python = shlex.quote(Path(sys.executable).as_posix())
    hook = ("\n".join(HOOK_HEADER) + f'\nexec {python} -I -B "$hook_dir/{HELPER_NAME}" "$@"\n').encode("utf-8")
    files = []
    for path, after in [(hooks / HELPER_NAME, helper), (hooks / "post-checkout", hook)]:
        ordinary(path)
        before = path.read_bytes() if path.exists() else None
        if before is not None and before != after:
            if path.name == HELPER_NAME or not owned_hook(before):
                raise RuntimeError("Existing hook differs; inspect before replacement: " + str(path))
        files.append({"path": path, "before": before, "after": after})
    return {"primary": primary, "files": files}


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
