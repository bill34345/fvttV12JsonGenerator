"""Read-only integrity check for one staged Foundry module and its ZIP archive."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import zipfile


def digest(stream):
    checksum = hashlib.sha256()
    size = 0
    while chunk := stream.read(1024 * 1024):
        checksum.update(chunk)
        size += len(chunk)
    return size, checksum.hexdigest()


def ordinary(mode, attributes=0):
    return stat.S_ISREG(mode) and not (attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def safe_path(name):
    parts = name.split("/")
    if not name or "\\" in name or any(part in ("", ".", "..") or ":" in part for part in parts):
        raise ValueError(f"unsafe archive path: {name!r}")
    return name


def stage_files(root):
    root_stat = root.lstat()
    root_attributes = getattr(root_stat, "st_file_attributes", 0)
    if not stat.S_ISDIR(root_stat.st_mode) or root_attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
        raise ValueError("module root is not an ordinary directory")
    files = {}

    def visit(directory):
        with os.scandir(directory) as entries:
            for entry in entries:
                info = entry.stat(follow_symlinks=False)
                attributes = getattr(info, "st_file_attributes", 0)
                if attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0) or stat.S_ISLNK(info.st_mode):
                    raise ValueError(f"stage link or junction: {entry.path}")
                if stat.S_ISDIR(info.st_mode):
                    visit(entry.path)
                elif ordinary(info.st_mode, attributes):
                    relative = Path(entry.path).relative_to(root).as_posix()
                    safe_path(relative)
                    files[relative] = Path(entry.path)
                else:
                    raise ValueError(f"stage entry is not an ordinary file: {entry.path}")

    visit(root)
    return files


def verify(root, archive, module_id, version, expected_paths=None):
    root = Path(os.path.abspath(root))
    archive = Path(os.path.abspath(archive))
    files = stage_files(root)
    if "module.json" not in files:
        raise ValueError("stage has no module.json")
    manifest = json.loads(files["module.json"].read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("id") != module_id or manifest.get("version") != version:
        raise ValueError("module.json id or version differs from requested identity")
    if expected_paths is not None:
        if not isinstance(expected_paths, list) or any(not isinstance(path, str) for path in expected_paths):
            raise ValueError("expected paths must be a JSON array of file paths")
        for path in expected_paths:
            safe_path(path)
        if sorted(expected_paths) != sorted(files):
            raise ValueError("stage paths differ from expected paths")

    archive_stat = archive.lstat()
    if not ordinary(archive_stat.st_mode, getattr(archive_stat, "st_file_attributes", 0)):
        raise ValueError("archive is not an ordinary file")
    with archive.open("rb") as stream:
        archive_size, archive_hash = digest(stream)
    reports = []
    with zipfile.ZipFile(archive) as zipped:
        entries = {}
        folded = set()
        for info in zipped.infolist():
            name = safe_path(info.filename)
            mode = info.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if info.is_dir() or kind not in (0, stat.S_IFREG) or info.flag_bits & 1:
                raise ValueError(f"archive contains a directory, link, or special entry: {name}")
            if name.casefold() in folded:
                raise ValueError(f"duplicate archive path: {name}")
            folded.add(name.casefold())
            entries[name] = info
        if set(entries) != set(files):
            raise ValueError("archive paths differ from stage paths")
        for name in sorted(files):
            with files[name].open("rb") as stream:
                stage_size, stage_hash = digest(stream)
            with zipped.open(entries[name]) as stream:
                zipped_size, zipped_hash = digest(stream)  # ZipExtFile checks CRC at EOF.
            if stage_size != zipped_size or stage_hash != zipped_hash:
                raise ValueError(f"archive bytes differ from stage: {name}")
            reports.append({"path": name, "size": stage_size, "sha256": stage_hash})
    return {"ok": True, "scope": "file-integrity-only", "moduleId": module_id,
            "version": version, "files": reports,
            "archive": {"size": archive_size, "sha256": archive_hash}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--module-root", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--module-id", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--expected-paths", help="JSON array of relative file paths")
    args = parser.parse_args()
    try:
        expected = json.loads(args.expected_paths) if args.expected_paths is not None else None
        report = verify(args.module_root, args.archive, args.module_id, args.version, expected)
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "scope": "file-integrity-only", "error": str(error)}))
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
