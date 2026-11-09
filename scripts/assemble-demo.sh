#!/usr/bin/env bash
# Usage: scripts/assemble-demo.sh VIDEO_DIR NARRATION_DIR_OR_- SCENES_JSON [OUTPUT_MP4]
# Requires Python 3, ffmpeg with libass/libx264/AAC, and ffprobe.
# FFMPEG / FFPROBE may name alternate executables. No narration => no audio stream.
# Narration never cuts recorded actions: duration=max(video, narration), rounded to
# a whole video frame. Longer narration freezes the last frame using tpad.
# Missing narration in a partly voiced edit gets silence, for consistent concatenation.
# Five-second storyboard cues scale proportionally; this is not forced alignment.
set -euo pipefail
if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo 'Usage: assemble-demo.sh VIDEO_DIR NARRATION_DIR_OR_- SCENES_JSON [OUTPUT_MP4]' >&2
  exit 2
fi
exec python3 - "$@" <<'PY'
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap

video_dir = Path(sys.argv[1]).resolve()
voice_dir = None if sys.argv[2] == '-' else Path(sys.argv[2]).resolve()
spec_file = Path(sys.argv[3]).resolve()
output = Path(sys.argv[4]).resolve() if len(sys.argv) > 4 else video_dir / 'demo_silent_captioned.mp4'
ffmpeg = shutil.which(os.environ.get('FFMPEG', 'ffmpeg'))
ffprobe = shutil.which(os.environ.get('FFPROBE', 'ffprobe'))
if not ffmpeg or not ffprobe:
    raise SystemExit('Install ffmpeg and ffprobe, or set FFMPEG and FFPROBE.')

def probe(path):
    return json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)], text=True))

def media_duration(info, kind):
    stream = next((s for s in info['streams'] if s['codec_type'] == kind), None)
    if not stream:
        raise ValueError(f'Missing {kind} stream')
    value = float(stream.get('duration', info['format']['duration']))
    if not math.isfinite(value) or value <= 0:
        raise ValueError('Invalid media duration')
    return value

data = json.loads(spec_file.read_text(encoding='utf-8'))
scenes = data['scenes'] if isinstance(data, dict) else data
if not scenes:
    raise SystemExit('No scenes in scenes.json')
prepared, seen = [], set()
for spec in scenes:
    number = spec['number']
    if type(number) is not int or number < 1 or number in seen:
        raise ValueError('Scene numbers must be unique positive integers')
    seen.add(number)
    name = f'scene_{number:02d}'
    clip = video_dir / f'{name}.mp4'
    if clip == output:
        raise ValueError('Output must not overwrite a source clip')
    video_seconds = media_duration(probe(clip), 'video')
    nominal = float(spec['duration'])
    if not math.isfinite(nominal) or nominal <= 0:
        raise ValueError('Invalid storyboard duration')
    voice = voice_dir / f'{name}.wav' if voice_dir else None
    voice = voice if voice and voice.is_file() else None
    audio_seconds = media_duration(probe(voice), 'audio') if voice else None
    target = math.ceil((max(video_seconds, audio_seconds) if voice else nominal) * 30 - 1e-6) / 30
    cues, previous_end = [], 0
    for cue in spec['subtitles']:
        start, end, text = float(cue['start']), float(cue['end']), cue['text']
        if not (0 <= previous_end <= start < end <= nominal) or not isinstance(text, str) or not text.strip():
            raise ValueError(f'Invalid or overlapping subtitle in {name}')
        previous_end = end
        cues.append((start * target / nominal, end * target / nominal, text))
    prepared.append(dict(name=name, clip=clip, voice=voice, video_seconds=video_seconds,
                         narration_seconds=audio_seconds, duration=target, cues=cues))
has_audio = any(s['voice'] for s in prepared)
output.parent.mkdir(parents=True, exist_ok=True)

def ass_time(seconds):
    cs = round(seconds * 100)
    return f'{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}'

def ass_text(text):
    # Neutralize ASS override syntax; preserve visible ordinary English text.
    text = text.replace('\\', '／').replace('{', '｛').replace('}', '｝')
    return r'\N'.join(textwrap.wrap(' '.join(text.split()), width=92, break_long_words=False, break_on_hyphens=False))

header = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,32,&H00FFFFFF,&H00FFFFFF,&H00203232,&H00203232,0,0,0,0,100,100,0,0,1,0,0,2,90,90,37,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''

def run(arguments, cwd):
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', *arguments], cwd=cwd, check=True)

with tempfile.TemporaryDirectory(prefix='trial-assemble-') as tmp_name:
    tmp = Path(tmp_name)
    concat = []
    for index, scene in enumerate(prepared):
        print(f"Assembling {scene['name']}: {scene['duration']:.3f}s ({'narration' if scene['voice'] else 'silent'})", flush=True)
        ass = header + ''.join(f'Dialogue: 0,{ass_time(a)},{ass_time(b)},Default,,0,0,0,,{ass_text(t)}\n' for a, b, t in scene['cues'])
        (tmp / 'captions.ass').write_text(ass, encoding='utf-8')
        duration = scene['duration']
        filters = (f'fps=30,scale=1920:960:force_original_aspect_ratio=decrease:flags=lanczos,'
                   f'pad=1920:1080:(ow-iw)/2:0:color=0xf4f6f7,setsar=1,'
                   f'tpad=stop_mode=clone:stop_duration={duration},trim=duration={duration},setpts=PTS-STARTPTS,'
                   'drawbox=x=0:y=960:w=1920:h=120:color=0x0f4446:t=fill,ass=captions.ass')
        arguments = ['-i', str(scene['clip'])]
        if has_audio:
            if scene['voice']:
                arguments += ['-i', str(scene['voice'])]
            else:
                arguments += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
            arguments += ['-map', '0:v:0', '-map', '1:a:0', '-af', f'aresample=48000,apad,atrim=duration={duration},asetpts=PTS-STARTPTS', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2']
        else:
            arguments += ['-map', '0:v:0', '-an']
        part = f'part_{index:03d}.mov'
        # MOV retains an exact 30 fps time base as well as uncompressed audio.
        arguments += ['-vf', filters, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-threads', '4', '-video_track_timescale', '15360', '-t', str(duration), part]
        run(arguments, tmp)
        concat.append(f"file '{part}'\n")
    (tmp / 'concat.txt').write_text(''.join(concat), encoding='utf-8')
    total = sum(s['duration'] for s in prepared)
    # PCM intermediate audio avoids per-scene AAC encoder-delay gaps.
    arguments = ['-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-map', '0:v:0', '-c:v', 'copy']
    arguments += ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'] if has_audio else ['-an']
    arguments += ['-t', str(total), '-video_track_timescale', '15360', '-movflags', '+faststart', 'assembled.mp4']
    run(arguments, tmp)
    checked = probe(tmp / 'assembled.mp4')
    video = next(s for s in checked['streams'] if s['codec_type'] == 'video')
    audio = [s for s in checked['streams'] if s['codec_type'] == 'audio']
    if (video['codec_name'] != 'h264' or video['width'] != 1920 or video['height'] != 1080
            or video['avg_frame_rate'] != '30/1' or abs(float(checked['format']['duration']) - total) > 0.04
            or bool(audio) != has_audio or any(s['codec_name'] != 'aac' for s in audio)):
        raise ValueError('Assembled output failed format/duration verification')
    # Do not destroy an existing output until every scene has encoded successfully.
    shutil.copyfile(tmp / 'assembled.mp4', output)

report = dict(audio='AAC' if has_audio else 'none', codec='H.264', fps=30, resolution='1920x1080',
              total_duration=total, subtitle_timing='Proportionally scaled storyboard cues, not speech-aligned',
              scenes=[{k: s[k] for k in ('name', 'video_seconds', 'narration_seconds', 'duration')} for s in prepared])
output.with_suffix('.assembly.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f'Finished: {output.name} ({total:.3f}s)', flush=True)
PY
