"""Initialize the unified Foundry entry and disabled legacy entries in new worktrees."""
from pathlib import Path
import os
import re
import subprocess
import sys
import tomllib
import uuid

NAMES = ("foundry-mirror", "foundry-next", "foundry-production-readonly", "foundry")
COMMON = Path(__file__).resolve().parents[1]
INCLUDE = b".codex/config.toml\n"

def git(*args):
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE).decode("utf-8").strip()

def write_checked(path, before, after):
    if before == after:
        return False
    if path.is_symlink() or path.parent.is_symlink():
        raise RuntimeError("Refusing a symlink configuration path: " + str(path))
    path.parent.mkdir(exist_ok=True)
    if before is None:
        with path.open("xb") as handle:
            handle.write(after)
        return True
    if path.read_bytes() != before:
        raise RuntimeError("Configuration changed concurrently: " + str(path))
    temporary = path.with_name(path.name + ".foundry-mcp-" + uuid.uuid4().hex + ".tmp")
    with temporary.open("xb") as handle:
        handle.write(after)
        handle.flush()
        os.fsync(handle.fileno())
    if path.read_bytes() != before:
        temporary.unlink()
        raise RuntimeError("Configuration changed concurrently: " + str(path))
    os.replace(temporary, path)
    return True

def main():
    if len(sys.argv) != 4 or sys.argv[3] != "1":
        return
    common = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir")).resolve()
    if common != COMMON or COMMON.name != ".git":
        raise RuntimeError("Foundry MCP hook is outside its owning repository.")
    target = Path(git("rev-parse", "--show-toplevel")).resolve()
    source = COMMON.parent / ".codex/config.toml"
    if source.is_symlink() or source.parent.is_symlink():
        raise RuntimeError("Refusing a symlink source configuration.")
    raw = source.read_bytes()
    data = tomllib.loads(raw.decode("utf-8-sig"))
    originals = {name: data["mcp_servers"][name] for name in NAMES}
    if not all(isinstance(entry.get("enabled"), bool) for entry in originals.values()):
        raise RuntimeError("Source Foundry MCP entries must have an explicit enabled state.")
    headers = list(re.finditer(rb"(?m)^\[([^\r\n\]]+)\][ \t]*\r?$", raw))
    blocks = {name: [] for name in NAMES}
    for index, header in enumerate(headers):
        key = header.group(1).decode("utf-8")
        for name in NAMES:
            if key == "mcp_servers." + name or key.startswith("mcp_servers." + name + "."):
                end = headers[index + 1].start() if index + 1 < len(headers) else len(raw)
                blocks[name].append(raw[header.start():end])
    template = b"".join(part for name in NAMES for part in blocks[name])
    if tomllib.loads(template.decode("utf-8-sig")) != {"mcp_servers": originals}:
        raise RuntimeError("Could not isolate exactly the Foundry MCP entries.")
    destination = target / ".codex/config.toml"
    if destination.is_symlink() or destination.parent.is_symlink():
        raise RuntimeError("Refusing a symlink destination configuration.")
    before = destination.read_bytes() if destination.exists() else None
    existing = tomllib.loads(before.decode("utf-8-sig")) if before is not None else {}
    servers = existing.get("mcp_servers", {})
    missing = [name for name in NAMES if name not in servers]
    for name in NAMES:
        if name in servers and servers[name] != originals[name]:
            raise RuntimeError("Existing Foundry MCP entry differs; left unchanged: " + name)
    appended = b"".join(part for name in missing for part in blocks[name])
    after = (before.rstrip(b"\r\n") + b"\n\n" + appended if before else appended) if missing else before
    expected = dict(existing)
    expected["mcp_servers"] = dict(servers, **{name: originals[name] for name in missing})
    if tomllib.loads((after or b"").decode("utf-8-sig")) != expected:
        raise RuntimeError("Refusing to alter unrelated configuration.")
    config_changed = write_checked(destination, before, after)
    manifest = target / ".worktreeinclude"
    original_manifest = manifest.read_bytes() if manifest.exists() else None
    lines = (original_manifest or b"").splitlines()
    new_manifest = original_manifest
    if not any(line.strip() in (b".codex/config.toml", b"/.codex/config.toml") for line in lines):
        new_manifest = (original_manifest.rstrip(b"\r\n") + b"\n" if original_manifest else b"") + INCLUDE
    manifest_changed = write_checked(manifest, original_manifest, new_manifest)
    if config_changed or manifest_changed:
        print("[foundry-mcp] Worktree configuration initialized from the primary checkout.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("[foundry-mcp] " + str(exc), file=sys.stderr)
        raise SystemExit(1)
