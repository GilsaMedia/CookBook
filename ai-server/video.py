#!/usr/bin/env python3
"""Reads a short cooking video: what's said and what's shown.

Usage: video.py <url> <out_dir>   ->  prints one JSON object on stdout:
  {"caption", "title", "author", "thumbnail", "duration", "language",
   "transcript", "sheets": ["sheet-1.jpg", ...]}
  or {"error": "<code>"} (exit 1).

Speech becomes text with faster-whisper on the CPU (no audio leaves the
machine). Frames from across the video are laid out on contact sheets in
<out_dir>, for Claude to read on-screen text and see the steps.

Runs on the owner's home server, so it only fetches from known video sites
(never an arbitrary address on the home network), skips videos longer than
MAX_SECONDS and downloads into a temporary folder that's deleted afterwards.
"""
import json
import os
import pathlib
import sys
import tempfile
from urllib.parse import urlparse

VIDEO_SITES = ("tiktok.com", "youtube.com", "youtu.be", "instagram.com")
MAX_SECONDS = 180  # keeps the whole import inside the Edge Function's time limit
MAX_BYTES = 120 * 1024 * 1024
MAX_FRAMES = 18  # two 3x3 sheets
FRAME_WIDTH = 360


def is_video_site(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.port not in (None, 443):
        return False
    return any(host == site or host.endswith("." + site) for site in VIDEO_SITES)


def fail(code: str) -> None:
    print(json.dumps({"error": code}))
    sys.exit(1)


def transcribe(path: str) -> tuple[str, str | None]:
    from faster_whisper import WhisperModel

    model = WhisperModel(
        os.environ.get("WHISPER_MODEL", "small"),
        device="cpu",
        compute_type="int8",
        cpu_threads=int(os.environ.get("WHISPER_THREADS", "4")),
    )
    # Music under the voice is common in cooking videos: a lenient voice filter,
    # and no conditioning on earlier text (it made Whisper stop after a sentence).
    segments, meta = model.transcribe(
        path,
        beam_size=1,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={"threshold": 0.2, "min_silence_duration_ms": 1000},
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return text, meta.language


def contact_sheets(path: str, out_dir: pathlib.Path) -> list[str]:
    """Distinct frames spread over the video, 3x3 per JPEG sheet."""
    import av
    from PIL import Image, ImageChops, ImageStat

    frames = []
    with av.open(path) as container:
        if not container.streams.video:
            return []
        stream = container.streams.video[0]
        duration = float(container.duration or 0) / av.time_base
        step = max(1.0, duration / (MAX_FRAMES + 2)) if duration else 2.0
        next_at = step / 2
        previous = None
        for frame in container.decode(stream):
            if frame.time is None or frame.time < next_at:
                continue
            next_at += step
            image = frame.to_image()
            image = image.resize((FRAME_WIDTH, round(image.height * FRAME_WIDTH / image.width)))
            thumb = image.convert("L").resize((16, 16))
            # Skip frames that barely changed: a static shot shouldn't fill the sheet.
            if previous is not None and ImageStat.Stat(ImageChops.difference(thumb, previous)).mean[0] < 6:
                continue
            previous = thumb
            frames.append(image)
            if len(frames) >= MAX_FRAMES:
                break

    sheets = []
    for n in range(0, len(frames), 9):
        batch = frames[n : n + 9]
        width = FRAME_WIDTH
        height = max(f.height for f in batch)
        sheet = Image.new("RGB", (width * 3, height * ((len(batch) + 2) // 3)), "white")
        for i, f in enumerate(batch):
            sheet.paste(f, ((i % 3) * width, (i // 3) * height))
        name = f"sheet-{n // 9 + 1}.jpg"
        sheet.save(out_dir / name, "JPEG", quality=72)
        sheets.append(name)
    return sheets


def main(url: str, out_dir: str) -> None:
    if not is_video_site(url):
        fail("blocked_url")
    import yt_dlp

    with tempfile.TemporaryDirectory(prefix="cookbook-video-") as tmp:
        opts = {
            "outtmpl": f"{tmp}/video.%(ext)s",
            # One file with picture and sound: there's no ffmpeg on this server to merge.
            "format": "best[vcodec!=none][acodec!=none]/best",
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "max_filesize": MAX_BYTES,
            "match_filter": yt_dlp.utils.match_filter_func(f"duration <= {MAX_SECONDS}"),
            "socket_timeout": 15,
            "cachedir": False,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True) or {}
        except Exception:
            fail("fetch_failed")
        files = sorted(pathlib.Path(tmp).glob("video.*"))
        if not files:
            fail("video_too_long" if (info.get("duration") or 0) > MAX_SECONDS else "fetch_failed")

        video = str(files[0])
        transcript, language = transcribe(video)
        sheets = contact_sheets(video, pathlib.Path(out_dir))

    print(
        json.dumps(
            {
                "caption": (info.get("description") or "")[:5000],
                "title": info.get("title"),
                "author": info.get("uploader") or info.get("creator") or info.get("channel"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "language": language,
                "transcript": transcript[:20000],
                "sheets": sheets,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        fail("bad_request")
    main(sys.argv[1], sys.argv[2])
