#!/usr/bin/env bash
# sfx.sh <dir> — synthesize the template's sound effects into <dir>: click.wav, pop.wav and whoosh.wav.
# Short and quiet, made from noise and tones with ffmpeg, so there's no licence to check. studio.sh runs it
# for every showcase; put your own files of the same names in public/sfx/ for a different feel.
set -euo pipefail
dir="${1:?usage: sfx.sh <dir>}"
mkdir -p "$dir"
gen() { ffmpeg -v error -y -f lavfi -i "$1" -ac 2 -ar 48000 "$dir/$2.wav"; }
# a click: a 30 ms tick of bright noise, dying away fast
gen "aevalsrc='(random(1)*2-1)*exp(-t*220)*0.9':d=0.03:s=48000,highpass=f=1800" click
# a pop: a tone falling from 700 Hz as it fades, like a bubble
gen "aevalsrc='sin(2*PI*(700*t-1800*t*t))*exp(-t*28)*0.8':d=0.16:s=48000" pop
# a whoosh: soft pink noise swelling and falling away over half a second, band-limited to sound like air
gen "anoisesrc=d=0.5:c=pink:a=0.6:r=48000:seed=7,bandpass=f=1100:w=1.4,afade=t=in:d=0.28:curve=qsin,afade=t=out:st=0.28:d=0.22:curve=qsin" whoosh
