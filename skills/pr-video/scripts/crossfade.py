#!/usr/bin/env python3
"""Join matching-size video clips with 0.4-second overlaps and 30 fps H.264."""

import json
import subprocess
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

FPS = 30
FADE_FRAMES = 12  # 0.4 seconds at 30 fps.


def probe(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,duration:format=duration",
         "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    metadata = json.loads(result.stdout)
    if not metadata.get("streams"):
        raise ValueError(f"No video stream: {path}")
    stream = metadata["streams"][0]
    duration = stream.get("duration") or metadata.get("format", {}).get("duration")
    if duration is None or duration == "N/A":
        raise ValueError(f"Cannot determine video duration: {path}")
    duration = Decimal(duration)
    if not duration.is_finite() or duration <= 0:
        raise ValueError(f"Invalid video duration: {path}")
    frames = int((duration * FPS).to_integral_value(rounding=ROUND_HALF_UP))
    if frames <= FADE_FRAMES:
        raise ValueError(f"Each clip must be longer than 0.4 seconds: {path}")
    return (stream["width"], stream["height"]), frames


def main():
    if len(sys.argv) < 4:
        raise ValueError("Usage: crossfade <out.mp4> <a.mp4> <b.mp4> ...")
    output = Path(sys.argv[1]).resolve()
    inputs = [Path(name).resolve() for name in sys.argv[2:]]
    if output in inputs:
        raise ValueError("Output must be different from every input clip")
    clips = [probe(path) for path in inputs]
    size = clips[0][0]
    if any(dimensions != size for dimensions, _ in clips):
        raise ValueError("All crossfade input clips must have the same width and height")
    if any(dimension % 2 for dimension in size):
        raise ValueError("H.264 yuv420p output requires even input width and height")

    command = ["ffmpeg", "-y", "-hide_banner", "-filter_complex_threads", "1"]
    for path in inputs:
        command.extend(["-i", str(path)])
    filters = []
    for index, (_, frames) in enumerate(clips):
        # Normalize timestamps and frame rate before xfade. Round duration to a
        # frame boundary, padding with the last frame if conversion falls short.
        filters.append(
            f"[{index}:v:0]setpts=PTS-STARTPTS,fps={FPS}:start_time=0,"
            f"tpad=stop_mode=clone:stop_duration=1,trim=end_frame={frames},"
            f"settb=AVTB,setpts=N/({FPS}*TB),setsar=1,format=yuv420p[v{index}]"
        )
    total_frames = clips[0][1]
    previous = "v0"
    for index, (_, frames) in enumerate(clips[1:], start=1):
        # Every prior overlap has already shortened the accumulated timeline.
        offset = (Decimal(total_frames - FADE_FRAMES) / FPS)
        joined = f"joined{index}"
        filters.append(
            f"[{previous}][v{index}]xfade=transition=fade:duration=0.4:"
            f"offset={offset:.9f}[{joined}]"
        )
        total_frames += frames - FADE_FRAMES
        previous = joined
    # Bound the output by frame count so chained filters cannot add a tail.
    filters.append(f"[{previous}]trim=end_frame={total_frames},format=yuv420p[out]")
    command.extend([
        "-filter_complex", ";".join(filters), "-map", "[out]",
        "-frames:v", str(total_frames), "-r", str(FPS),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-an", str(output),
    ])
    subprocess.run(command, check=True)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"crossfade: {error}", file=sys.stderr)
        sys.exit(1)
