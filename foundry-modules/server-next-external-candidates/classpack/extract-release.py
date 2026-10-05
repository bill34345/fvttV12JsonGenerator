"""Extract the pinned release into a new, owned candidate directory."""

import os
import pathlib
import stat
import sys
import zipfile

archive = pathlib.Path(sys.argv[1]).resolve(strict=True)
destination = pathlib.Path(sys.argv[2]).resolve()
if destination.exists():
    raise SystemExit(f"Candidate already exists: {destination}")
long_destination = pathlib.Path("\\\\?\\" + str(destination)) if os.name == "nt" else destination

with zipfile.ZipFile(archive) as released:
    entries = released.infolist()
    names = [entry.filename for entry in entries]
    if len(names) != len(set(names)):
        raise SystemExit("Duplicate archive paths")
    for entry in entries:
        name = pathlib.PurePosixPath(entry.filename)
        if name.is_absolute() or ".." in name.parts or ":" in entry.filename:
            raise SystemExit(f"Unsafe archive path: {entry.filename}")
        if stat.S_ISLNK(entry.external_attr >> 16):
            raise SystemExit(f"Archive symlink refused: {entry.filename}")
    if "module.json" not in names:
        raise SystemExit("Release manifest missing")
    os.makedirs(long_destination, exist_ok=False)
    released.extractall(long_destination)

print(f"Extracted {len(entries)} release entries into {destination}")
