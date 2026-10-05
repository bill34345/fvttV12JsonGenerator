"""Rebuild six independent 180-second stereo ambience candidates from licensed sources.

Requires Python 3 with numpy and ffmpeg/ffprobe on PATH. Pass the licensed input
bundle with --source-root; writes six canonical OGGs and an explicit report path.
No Tile Arsenal recording is used, decoded, or copied by this script.
"""
from __future__ import annotations

import hashlib
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source-root", type=Path, required=True,
                    help="Licensed bundle containing sources/ and the approved energy-loop.ogg")
parser.add_argument("--output-root", type=Path, required=True, help="Destination for the six canonical audio files")
parser.add_argument("--report", type=Path, required=True, help="Mechanical validation JSON outside the shipped audio folder")
args = parser.parse_args()
INPUT_ROOT = args.source_root.resolve()
ROOT = args.output_root.resolve()
REPORT = args.report.resolve()
SRC = INPUT_ROOT / "sources"
OUTPUT_NAMES = {"fire": "fire-loop.ogg", "acid": "acid-loop.ogg", "holy": "chime-loop.ogg",
                "unholy": "drone-loop.ogg", "lava": "lava-loop.ogg", "magic-circle": "magic-circle-loop.ogg"}
# Resolve ancestry before creating anything: reports must not overwrite licensed
# inputs, and neither reports nor licensed bundles belong in shipped assets.
if (ROOT.is_relative_to(INPUT_ROOT) or INPUT_ROOT.is_relative_to(ROOT)
        or REPORT.is_relative_to(INPUT_ROOT) or REPORT.is_relative_to(ROOT)):
    raise SystemExit("Input/output trees must not overlap; report must remain outside both trees")
# An existing output filename may itself be a symlink to an approved input or
# to energy-loop.ogg. Only the six literal output paths are writable.
if any((ROOT / name).resolve() != ROOT / name for name in OUTPUT_NAMES.values()):
    raise SystemExit("Canonical audio outputs must not redirect through symlinks")
RATE = 32000
SECONDS = 180
FADE_SECONDS = 2
N = RATE * SECONDS
FULL_N = RATE * (SECONDS + FADE_SECONDS)
RNG_SEED = 20261004
FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
if not FFMPEG or not FFPROBE:
    raise SystemExit("ffmpeg and ffprobe must be on PATH")

EXPECTED = {
    "fireplace-pagdev-cc0.wav": "85ca0cc60d0c037fff8b185e31ad1fcdbda6ce45eee17c3ee1318d1b8f59e330",
    "fire-spell-bart-ccby3.wav": "8accb7cb099c14273527759cbf6812e00a918ca5fc91ca6b21698133642daa60",
    "acid-spookymodem-ccby3.wav": "c42df36cf285df06aabb3a46dccc34b1a116317b884ed0160a30b02cde3e486b",
    "atmoseerie01.mp3.flac": "92cfa7b259b758124a55c9e0ee4e68de154bb03c67eb95bda5dedcd8a3dcf426",
    "atmoseerie02.mp3.flac": "e0af0c26846977c811dc736eecee8b8fc0185bad3caa83a3f73ae6c3a626dcc9",
    "atmoseerie03.mp3.flac": "559949749932a13331096534e05cb4c09131df8641fbaaa900ef1d534f69ccae",
    "atmoseerie04.mp3.flac": "33f84951ff80de1fed0a414065df1de5029339467b487775de0790c231c31153",
    "energy-loop.ogg": "a7502a3940ca3f1d0cafb81acd9cc6498c551ac5e2553bbede8c8896468b1439",
}


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def source_path(name: str) -> Path:
    return INPUT_ROOT / name if name == "energy-loop.ogg" else SRC / name


for filename, expected in EXPECTED.items():
    actual = sha(source_path(filename))
    if actual != expected:
        raise SystemExit(f"Source hash mismatch: {filename}: {actual}")

import numpy as np

ROOT.mkdir(parents=True, exist_ok=True)
REPORT.parent.mkdir(parents=True, exist_ok=True)


def decode(path: Path) -> np.ndarray:
    result = subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(path), "-ar", str(RATE), "-ac", "2", "-f", "f32le", "-"],
        check=True, capture_output=True,
    )
    pcm = np.frombuffer(result.stdout, dtype="<f4")
    if len(pcm) % 2:
        raise RuntimeError(f"Odd stereo sample count in {path}")
    return pcm.reshape(-1, 2).copy()


def band(source: np.ndarray, low: float, high: float) -> np.ndarray:
    """Smooth frequency-domain shelves on short source recordings only."""
    bins = np.fft.rfftfreq(len(source), 1 / RATE)
    gain = 1 / np.sqrt(1 + (bins / high) ** 8)
    if low:
        gain *= np.sqrt((bins / low) ** 8 / (1 + (bins / low) ** 8))
    spectrum = np.fft.rfft(source.astype(np.float64), axis=0)
    spectrum *= gain[:, None]
    return np.fft.irfft(spectrum, n=len(source), axis=0).astype(np.float32)


def speed(source: np.ndarray, factor: float) -> np.ndarray:
    count = max(1, round(len(source) / factor))
    index = np.linspace(0, len(source) - 1, count)
    old = np.arange(len(source))
    return np.stack([np.interp(index, old, source[:, c]) for c in range(2)], axis=1).astype(np.float32)


def rms(source: np.ndarray) -> float:
    return float(np.sqrt(np.mean(source.astype(np.float64) ** 2)))


def db(value: float) -> float:
    return 20 * math.log10(max(value, 1e-12))


def set_rms(source: np.ndarray, target: float) -> np.ndarray:
    return source * (target / max(rms(source), 1e-9))


def pan(source: np.ndarray, position: float) -> np.ndarray:
    """Retain recorded stereo; vary left-right balance modestly per event."""
    position = float(np.clip(position, -0.65, 0.65))
    gain = np.array([math.sqrt((1 - position) / 2), math.sqrt((1 + position) / 2)], dtype=np.float32)
    return source * gain[None, :] * math.sqrt(2)


def fade(source: np.ndarray, seconds: float) -> np.ndarray:
    result = source.copy()
    length = min(round(seconds * RATE), len(result) // 2)
    if length:
        ramp = np.sin(np.linspace(0, math.pi / 2, length, dtype=np.float32)) ** 2
        result[:length] *= ramp[:, None]
        result[-length:] *= ramp[::-1, None]
    return result


def add(dest: np.ndarray, clip: np.ndarray, at: float, gain: float = 1) -> None:
    start = round(at * RATE)
    if start < 0:
        clip = clip[-start:]
        start = 0
    if start >= len(dest) or not len(clip):
        return
    end = min(len(dest), start + len(clip))
    dest[start:end] += clip[:end - start] * gain


def montage(name: str, sources: list[np.ndarray], seed: int, spacing: tuple[float, float],
            factor: tuple[float, float], fade_seconds: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dest = np.zeros((FULL_N, 2), np.float32)
    t = -max(len(s) for s in sources) / RATE * .45
    while t < SECONDS + FADE_SECONDS:
        source = sources[int(rng.integers(len(sources)))]
        shift = int(rng.integers(len(source)))
        segment = np.concatenate((source[shift:], source[:shift]), axis=0)
        segment = speed(segment, float(rng.uniform(*factor)))
        segment = fade(pan(segment, float(rng.uniform(-.45, .45))), fade_seconds)
        add(dest, segment, t, float(rng.uniform(.75, 1.2)))
        t += float(rng.uniform(*spacing))
    print(f"assembled {name}", flush=True)
    return dest


def loop_seam(full: np.ndarray) -> np.ndarray:
    """Crossfade tail continuation into the first two seconds of a 180s loop."""
    output = full[:N].copy()
    length = RATE * FADE_SECONDS
    ramp = np.sin(np.linspace(0, math.pi / 2, length, dtype=np.float32)) ** 2
    output[:length] = full[N:N + length] * (1 - ramp[:, None]) + full[:length] * ramp[:, None]
    return output


def master(source: np.ndarray, target_db: float, max_peak: float = .93,
           quiet_boundary: bool = False) -> np.ndarray:
    target = 10 ** (target_db / 20)
    candidate = set_rms(loop_seam(source), target)
    # Gentle symmetric saturation lowers isolated peaks without hard clipping.
    for _ in range(4):
        if float(np.max(np.abs(candidate))) <= max_peak:
            break
        candidate = np.tanh(candidate / max_peak).astype(np.float32) * max_peak
        candidate = set_rms(candidate, target)
    peak = float(np.max(np.abs(candidate)))
    if peak > max_peak:
        candidate *= max_peak / peak
    # Match the decoded first sample to the last sample through a short,
    # smoothly decaying correction; Vorbis may still introduce a tiny jump.
    length = round(.05 * RATE)
    correction = candidate[-1] - candidate[0]
    candidate[:length] += correction[None, :] * np.linspace(1, 0, length, dtype=np.float32)[:, None]
    if quiet_boundary:
        length = round(.12 * RATE)
        ramp = np.sin(np.linspace(0, math.pi / 2, length, dtype=np.float32)) ** 2
        candidate[:length] *= ramp[:, None]
        candidate[-length:] *= ramp[::-1, None]
    return candidate.astype(np.float32)


def encode(name: str, source: np.ndarray) -> Path:
    path = ROOT / OUTPUT_NAMES[name]
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "-",
         "-fflags", "+bitexact", "-flags:a", "+bitexact", "-c:a", "libvorbis", "-q:a", "5", str(path)],
        input=source.astype("<f4", copy=False).tobytes(), check=True,
    )
    return path


def probe(path: Path) -> dict:
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def repetition_metric(x: np.ndarray) -> dict:
    # Every two seconds, compare downsampled non-overlapping stereo-mean snippets.
    mono = x.mean(axis=1)
    step = RATE * 2
    clips = [mono[i:i + step:32].astype(np.float64) for i in range(0, len(mono) - step + 1, step)]
    vectors = np.stack(clips)
    vectors -= vectors.mean(axis=1, keepdims=True)
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-12
    scores = vectors @ vectors.T
    np.fill_diagonal(scores, 0)
    peak_index = np.unravel_index(np.argmax(np.abs(scores)), scores.shape)
    return {"maxAbsTwoSecondWindowCorrelation": float(abs(scores[peak_index])),
            "windowStartSeconds": [int(peak_index[0] * 2), int(peak_index[1] * 2)]}


def validate(path: Path, design: str, events: list[float] | None = None) -> dict:
    metadata = probe(path)
    stream = metadata["streams"][0]
    decoded = decode(path)
    channel_rms = np.sqrt(np.mean(decoded.astype(np.float64) ** 2, axis=0))
    second_rms = [rms(decoded[i * RATE:(i + 1) * RATE]) for i in range(SECONDS)]
    samples = np.abs(decoded)
    jump = float(np.max(np.abs(decoded[0] - decoded[-1])))
    ordinary_jump = float(np.percentile(np.abs(np.diff(decoded[:RATE], axis=0)), 95))
    mono = decoded.mean(axis=1)
    spectral_windows = mono[::10][:RATE * 6 // 10].reshape(6, RATE // 10)
    spectra = np.abs(np.fft.rfft(spectral_windows, axis=1)) ** 2 + 1e-12
    flatness = float(np.mean(np.exp(np.mean(np.log(spectra), axis=1)) / np.mean(spectra, axis=1)))
    stereo_correlation = float(np.corrcoef(decoded[::32, 0], decoded[::32, 1])[0, 1])
    result = {
        "file": path.name, "bytes": path.stat().st_size, "sha256": sha(path),
        "codec": stream["codec_name"], "sampleRate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]), "durationSeconds": float(metadata["format"]["duration"]),
        "decodedFrames": int(len(decoded)), "rms": rms(decoded), "rmsDbfs": db(rms(decoded)),
        "channelRmsDbfs": [db(float(v)) for v in channel_rms],
        "peak": float(samples.max()), "peakDbfs": db(float(samples.max())),
        "samplesAtOrAboveFullScale": int(np.count_nonzero(samples >= 1)),
        "secondsRmsDbfs": {"minimum": db(min(second_rms)), "median": db(float(np.median(second_rms))),
                            "maximum": db(max(second_rms))},
        "loopBoundaryMaxJump": jump, "firstSecond95PctAdjacentJump": ordinary_jump,
        "boundaryVsOrdinaryJump": jump / max(ordinary_jump, 1e-9),
        "spectralFlatnessFirstMinute": flatness, "stereoCorrelation": stereo_correlation,
        "repetition": repetition_metric(decoded), "design": design,
    }
    if events is not None:
        intervals = np.diff(events)
        result["scheduledEvents"] = {"count": len(events), "perMinute": len(events) / 3,
                                     "medianGapSeconds": float(np.median(intervals)),
                                     "minimumGapSeconds": float(np.min(intervals)),
                                     "maximumGapSeconds": float(np.max(intervals))}
    assert stream["codec_name"] == "vorbis" and int(stream["sample_rate"]) == RATE and int(stream["channels"]) == 2
    assert abs(len(decoded) / RATE - SECONDS) < .02
    assert result["peak"] < .96 and result["samplesAtOrAboveFullScale"] == 0
    assert result["loopBoundaryMaxJump"] < .01 and result["boundaryVsOrdinaryJump"] < 2
    assert result["repetition"]["maxAbsTwoSecondWindowCorrelation"] < .9
    return result


fireplace = decode(source_path("fireplace-pagdev-cc0.wav"))
spell = decode(source_path("fire-spell-bart-ccby3.wav"))
acid = decode(source_path("acid-spookymodem-ccby3.wav"))
ghosts = [decode(source_path(f"atmoseerie{i:02}.mp3.flac")) for i in range(1, 5)]
energy = decode(source_path("energy-loop.ogg"))
results: list[dict] = []


def write(name: str, audio: np.ndarray, target_db: float, design: str,
          events: list[float] | None = None, quiet_boundary: bool = False) -> None:
    path = encode(name, master(audio, target_db, quiet_boundary=quiet_boundary))
    row = validate(path, design, events)
    results.append(row)
    print(f"{path.name}: {row['rmsDbfs']:.2f} dBFS RMS, {row['peak']:.3f} peak", flush=True)


# Fire: recorded fireplace is a changing bed; broad whooshes carry the body.
fire_bed = montage("fire bed", [band(fireplace, 55, 1350)], RNG_SEED + 1, (12, 17), (.87, 1.13), 3.8)
fire_gust = np.zeros((FULL_N, 2), np.float32)
rng = np.random.default_rng(RNG_SEED + 2)
gust_times: list[float] = []
t = .4
while t < SECONDS + FADE_SECONDS:
    gust_times.append(t)
    clip = fade(speed(band(spell, 60, 3800), float(rng.uniform(.79, 1.28))), .18)
    add(fire_gust, pan(clip, float(rng.uniform(-.62, .62))), t, float(rng.uniform(.65, 1.25)))
    t += float(rng.uniform(1.6, 3.6))
fire = set_rms(fire_bed, .11) + set_rms(fire_gust, .135)
write("fire", fire, -16.0, "recorded fireplace body plus irregular fire-spell gusts; twig transients softened")
del fire_bed, fire_gust, fire


# Acid: select recorded bubble transients, with a much quieter diffuse corrosion bed.
mono = acid.mean(axis=1)
win = round(RATE * .018)
energy_bins = np.sqrt(np.mean(np.pad(mono ** 2, (0, -len(mono) % win)).reshape(-1, win), axis=1))
selected: list[float] = []
for index in np.argsort(energy_bins)[::-1]:
    at = index * win / RATE
    if .12 < at < len(acid) / RATE - .25 and all(abs(at - previous) > .19 for previous in selected):
        selected.append(at)
    if len(selected) == 6:
        break
if len(selected) < 4:
    raise RuntimeError("Acid source has fewer than four separable bubble events")
clips = [band(acid[max(0, round((at - .08) * RATE)):min(len(acid), round((at + .23) * RATE))], 120, 4900)
         for at in selected]
acid_events = np.zeros((FULL_N, 2), np.float32)
rng = np.random.default_rng(RNG_SEED + 3)
bubble_times: list[float] = []
t = 1.1
while t < SECONDS:
    bubble_times.append(t)
    clip = fade(speed(clips[len(bubble_times) % len(clips)], float(rng.uniform(.78, 1.3))), .025)
    clip = clip / max(float(np.max(np.abs(clip))), 1e-8)
    add(acid_events, pan(clip, float(rng.uniform(-.58, .58))), t, float(rng.uniform(.20, .43)))
    t += float(rng.uniform(2.2, 4.3))
corrosion = montage("acid bed", [band(acid, 900, 6200)], RNG_SEED + 4, (.32, .64), (.86, 1.18), .55)
acid_mix = set_rms(acid_events, .026) + set_rms(corrosion, .0042)
write("acid", acid_mix, -30.5, "recorded sparse bubbles dominate; low corrosion bed", bubble_times)
del acid_events, corrosion, acid_mix


# Holy: bright, diffuse ambience source audio is primary; accepted CC0 energy is only a trace.
holy_bed = montage("holy bed", [band(ghosts[0], 220, 5400), band(ghosts[3], 320, 6500)],
                   RNG_SEED + 5, (8.8, 13.5), (.86, 1.19), 4.5)
holy_air = montage("holy air", [band(ghosts[2], 1000, 7200)],
                   RNG_SEED + 13, (7, 11), (.91, 1.17), 4.0)
halo = np.zeros((FULL_N, 2), np.float32)
rng = np.random.default_rng(RNG_SEED + 6)
t = 5.0
while t < SECONDS + FADE_SECONDS:
    clip = fade(speed(band(energy, 480, 4800), float(rng.uniform(.72, 1.35))), .9)
    add(halo, pan(clip, float(rng.uniform(-.55, .55))), t, float(rng.uniform(.4, .85)))
    t += float(rng.uniform(11, 23))
holy = set_rms(holy_bed, .030) + set_rms(holy_air, .012) + set_rms(halo, .004)
write("holy", holy, -29.0, "airy ambience source with rare energy shimmer; no melodic chime")
del holy_bed, holy_air, halo, holy


# Unholy: broad CC0 ghost ambience, layered at different speeds rather than a pure drone.
unholy_a = montage("unholy bed", [band(ghosts[2], 55, 2400)], RNG_SEED + 7,
                     (9, 14), (.78, 1.17), 5)
unholy_b = montage("unholy motion", [band(ghosts[1], 250, 4100), band(ghosts[3], 160, 3100)],
                     RNG_SEED + 8, (12, 18), (.83, 1.21), 4.5)
unholy = set_rms(unholy_a, .036) + set_rms(unholy_b, .016)
write("unholy", unholy, -27.5, "layered CC0 ghost atmosphere; diffuse eerie low layer, no pure tone")
del unholy_a, unholy_b, unholy


# Distinct optional lava and magic-circle recordings reduce family reuse.
lava_bed = montage("lava bed", [band(fireplace, 42, 650)], RNG_SEED + 9,
                    (10, 15), (.73, 1.06), 4.0)
lava_motion = montage("lava motion", [band(spell, 38, 1050)], RNG_SEED + 10,
                       (1.3, 2.5), (.64, 1.12), .55)
lava = set_rms(lava_bed, .072) + set_rms(lava_motion, .061)
write("lava", lava, -20.5, "low molten rumble and slow whooshes distinct from Fire", quiet_boundary=True)
del lava_bed, lava_motion, lava

circle_bed = montage("circle bed", [band(ghosts[3], 180, 3900), band(ghosts[0], 360, 6200)],
                      RNG_SEED + 11, (8, 12), (.69, 1.12), 5)
circle_motion = montage("circle motion", [band(energy, 650, 4300)], RNG_SEED + 12,
                         (6, 11), (.8, 1.28), 2.2)
circle = set_rms(circle_bed, .029) + set_rms(circle_motion, .005)
write("magic-circle", circle, -30.0, "recorded airy arcane field with restrained energy movement")
del circle_bed, circle_motion, circle

report = {
    "status": "MECHANICAL_PASS_AUDIBLE_NOT_VERIFIED",
    "generator": Path(__file__).name, "seed": RNG_SEED, "targetSeconds": SECONDS,
    "sourceHashes": {key: sha(source_path(key)) for key in EXPECTED},
    "ffmpegVersion": subprocess.run([FFMPEG, "-version"], capture_output=True, text=True, check=True).stdout.splitlines()[0],
    "results": results,
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Validation written to {REPORT}", flush=True)
