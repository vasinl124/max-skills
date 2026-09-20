#!/usr/bin/env bash
# compose.sh — turn raw Playwright .webm clips into a captioned, stitched demo
# that GitHub can play inline. Uses ffmpeg for video and ImageMagick for text
# (some ffmpeg builds ship without drawtext/freetype, so text is rendered to PNG
# with `magick` and composited with ffmpeg's overlay filter — works everywhere).
#
# Requires: ffmpeg; ffprobe and python3 for crossfade; ImageMagick for title/label.
#
# Subcommands:
#   mp4  <in> <out.mp4>                       normalize any clip to web-safe H.264
#   title <"Text"> <secs> <WxH> <out.mp4>     solid title card (WxH must match clips)
#   label <in> <"Caption"> <out.mp4>          burn a caption box in the top-left
#   crossfade <out.mp4> <a.mp4> <b.mp4> ...   0.4s fades, 30 fps (same input WxH)
#   concat <out.mp4> <a.mp4> <b.mp4> ...      explicit hard cuts (same input WxH)
#   sidebyside <left> <right> <out.mp4>       two clips side by side (hstack)
#   highlight <in> <out.mp4> <x,y> <WxH> <t_start> <t_end> ["circle"|"arrow"|"box"]
#                                             draw a red highlight on a region for a time range
#                                             circle = ring (default), arrow = downward pointer,
#                                             box = rounded rectangle outline
#   gif  <in.mp4> <out.gif> [width]           high-quality gif (default 960px)
#
# Typical pipeline (customer → admin → customer), all at 1440x900:
#   S=compose.sh
#   "$S" mp4 1-customer/*.webm b.mp4 && "$S" label b.mp4 "1. Customer requests a refund" b1.mp4
#   "$S" mp4 2-admin/*.webm a.mp4 && "$S" label a.mp4 "2. Admin approves the request" a1.mp4
#   "$S" mp4 3-customer-after/*.webm c.mp4 && "$S" label c.mp4 "3. Customer sees it approved" c1.mp4
#   "$S" title "PR #123 — refund approval flow" 2 1440x900 t.mp4
#   "$S" crossfade demo.mp4 t.mp4 b1.mp4 a1.mp4 c1.mp4
#   "$S" gif demo.mp4 demo.gif 960
set -euo pipefail

# A concrete font file (ImageMagick needs one; macOS ships these).
FONT="${FONT:-}"
if [ -z "$FONT" ]; then
  for f in /System/Library/Fonts/Supplemental/Arial.ttf \
           /System/Library/Fonts/Helvetica.ttc \
           /Library/Fonts/Arial.ttf; do
    [ -f "$f" ] && FONT="$f" && break
  done
fi
IM="$(command -v magick || command -v convert || true)"
need_im() { [ -n "$IM" ] || { echo "compose.sh: ImageMagick not found — 'brew install imagemagick'"; exit 3; }; }
fontargs() { [ -n "$FONT" ] && printf -- "-font %s" "$FONT"; }

cmd="${1:-help}"; shift || true
case "$cmd" in
  mp4)
    ffmpeg -y -i "$1" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30" \
      -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "$2" ;;

  title)
    need_im
    text="$1"; dur="${2:-2}"; size="${3:-1440x900}"; out="$4"
    card="$(mktemp -t titlecard).png"
    "$IM" -size "$size" canvas:'#0b0b0f' -gravity center $(fontargs) \
      -fill white -pointsize 46 -annotate +0+0 "$text" "$card"
    ffmpeg -y -loop 1 -t "$dur" -i "$card" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,format=yuv420p" \
      -c:v libx264 -movflags +faststart "$out"
    rm -f "$card" ;;

  label)
    need_im
    in="$1"; text="$2"; out="$3"
    cap="$(mktemp -t caption).png"
    "$IM" -background '#000000AA' -fill white $(fontargs) -pointsize 30 \
      label:"$text" -bordercolor '#000000AA' -border 14 "$cap"
    ffmpeg -y -i "$in" -i "$cap" \
      -filter_complex "overlay=28:28,fps=30,format=yuv420p" \
      -c:v libx264 -movflags +faststart -an "$out"
    rm -f "$cap" ;;

  crossfade)
    python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/crossfade.py" "$@" ;;

  concat)
    out="$1"; shift
    list="$(mktemp)"
    for f in "$@"; do echo "file '$(cd "$(dirname "$f")" && pwd)/$(basename "$f")'" >> "$list"; done
    ffmpeg -y -f concat -safe 0 -i "$list" -c copy -movflags +faststart "$out" 2>/dev/null || \
    ffmpeg -y -f concat -safe 0 -i "$list" -r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$out"
    rm -f "$list" ;;

  sidebyside)
    ffmpeg -y -i "$1" -i "$2" \
      -filter_complex "[0:v]scale=-2:720,fps=30[l];[1:v]scale=-2:720,fps=30[r];[l][r]hstack=inputs=2" \
      -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$3" ;;

  highlight)
    need_im
    in="$1"; out="$2"
    IFS=',' read -r cx cy <<< "$3"
    IFS='x' read -r rw rh <<< "$4"
    t0="$5"; t1="$6"; shape="${7:-circle}"
    overlay="$(mktemp -t highlight).png"
    # probe video dimensions for the full-frame overlay canvas
    read vw vh <<< "$(ffmpeg -i "$in" 2>&1 | grep -oE '[0-9]{2,5}x[0-9]{2,5}' | head -1 | tr 'x' ' ')"
    case "$shape" in
      circle)
        "$IM" -size "${vw}x${vh}" xc:none \
          -stroke '#FF3333' -strokewidth 4 -fill none \
          -draw "ellipse $cx,$cy $((rw/2)),$((rh/2)) 0,360" "$overlay" ;;
      box)
        x1=$((cx - rw/2)); y1=$((cy - rh/2)); x2=$((cx + rw/2)); y2=$((cy + rh/2))
        "$IM" -size "${vw}x${vh}" xc:none \
          -stroke '#FF3333' -strokewidth 4 -fill none \
          -draw "roundrectangle $x1,$y1 $x2,$y2 8,8" "$overlay" ;;
      arrow)
        # downward arrow pointing at (cx, cy)
        "$IM" -size "${vw}x${vh}" xc:none \
          -stroke '#FF3333' -strokewidth 4 -fill '#FF3333' \
          -draw "line $cx,$((cy - 60)) $cx,$cy" \
          -draw "polygon $cx,$cy $((cx-10)),$((cy-16)) $((cx+10)),$((cy-16))" "$overlay" ;;
    esac
    ffmpeg -y -i "$in" -i "$overlay" \
      -filter_complex "[1:v]format=argb[ov];[0:v][ov]overlay=0:0:enable='between(t,$t0,$t1)',fps=30,format=yuv420p" \
      -c:v libx264 -movflags +faststart -an "$out"
    rm -f "$overlay" ;;

  gif)
    w="${3:-960}"; pal="$(mktemp -t palette).png"
    ffmpeg -y -i "$1" -vf "fps=12,scale=${w}:-1:flags=lanczos,palettegen" "$pal"
    ffmpeg -y -i "$1" -i "$pal" -lavfi "fps=12,scale=${w}:-1:flags=lanczos[x];[x][1:v]paletteuse" "$2"
    rm -f "$pal" ;;

  *)
    grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' ;;
esac
