#!/usr/bin/env bash
# Usage: scripts/assemble-demo.sh VIDEO_DIR - SCENES_JSON [OUTPUT_MP4]
# Concatenates the recorded clips without audio, subtitles, overlays or resizing.
# The second argument remains '-' for compatibility with the earlier command.
set -euo pipefail
if [[ $# -lt 3 || $# -gt 4 || "$2" != '-' ]]; then
  echo 'Usage: assemble-demo.sh VIDEO_DIR - SCENES_JSON [OUTPUT_MP4]' >&2
  exit 2
fi
exec python3 - "$@" <<'PY'
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

video_dir = Path(sys.argv[1]).resolve()
data = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))
output = Path(sys.argv[4]).resolve() if len(sys.argv) > 4 else video_dir / 'demo_silent.mp4'
ffmpeg = shutil.which(os.environ.get('FFMPEG', 'ffmpeg'))
ffprobe = shutil.which(os.environ.get('FFPROBE', 'ffprobe'))
if not ffmpeg or not ffprobe:
    raise SystemExit('Install ffmpeg and ffprobe, or set FFMPEG and FFPROBE.')

def probe(path):
    return json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)], text=True))

def verify(info, duration):
    streams = info['streams']
    if len(streams) != 1:
        raise ValueError('Expected exactly one video stream; no audio or subtitle tracks')
    v = streams[0]
    if (v['codec_type'] != 'video' or v['codec_name'] != 'h264'
            or v['width'] != 1920 or v['height'] != 1080 or v['avg_frame_rate'] != '30/1'
            or abs(float(info['format']['duration']) - duration) > 0.04):
        raise ValueError('Unexpected format or duration')

if data.get('burnedInSubtitles') is not False or data.get('audio') is not False:
    raise ValueError('Use the uncaptioned, silent recording manifest')
scenes = data['scenes']
if [s['number'] for s in scenes] != [1, 2, 3, 4, 5]:
    raise ValueError('Expected scenes 1 through 5 in order')
clips = [video_dir / f"scene_{s['number']:02d}.mp4" for s in scenes]
if output in clips:
    raise ValueError('Output must not overwrite a source clip')
for scene, clip in zip(scenes, clips):
    verify(probe(clip), scene['duration'])
total = sum(s['duration'] for s in scenes)
output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='trial-assemble-') as name:
    temp = Path(name)
    for i, clip in enumerate(clips):
        (temp / f'part_{i}.mp4').symlink_to(clip)
    (temp / 'concat.txt').write_text(''.join(f"file 'part_{i}.mp4'\n" for i in range(len(clips))))
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1',
                    '-i', 'concat.txt', '-map', '0:v:0', '-c:v', 'copy', '-an', '-sn',
                    '-movflags', '+faststart', 'assembled.mp4'], cwd=temp, check=True)
    verify(probe(temp / 'assembled.mp4'), total)
    shutil.copyfile(temp / 'assembled.mp4', output)
report = dict(audio=False, subtitleTracks=False, burnedInSubtitles=False, codec='H.264', fps=30,
              resolution='1920x1080', totalDuration=total, scenes=[dict(file=c.name, duration=s['duration']) for s,c in zip(scenes, clips)])
output.with_suffix('.assembly.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f'Finished: {output.name} ({total}s; silent, no subtitles)')
PY
