import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Standalone end-to-end smoke test for the MargeX FFmpeg + NVENC + Edge-to-Edge pipeline
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'margex-test-'));
console.log('Test workspace:', tmpDir);

try {
  // 1. Create a vertical 480x854 MP4 with audio (Master clip)
  const v1 = path.join(tmpDir, 'vertical_480x854.mp4');
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=s=480x854:d=2:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', v1,
  ]);

  // 2. Create an odd-sized horizontal 416x234 TS clip WITHOUT audio
  const v2 = path.join(tmpDir, 'odd_234p.ts');
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'smptebars=s=416x234:d=2:r=25',
    '-c:v', 'mpeg2video', '-f', 'mpegts', v2,
  ]);

  // 3. Create a 652x400 PNG image
  const img1 = path.join(tmpDir, 'photo_652p.png');
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=royalblue:s=652x400:d=1',
    '-frames:v', '1', img1,
  ]);

  // Run the exact MargeX Blurred Edge-to-Edge Fill filtergraph + NVENC encoding
  const outMp4 = path.join(tmpDir, 'merged_output.mp4');
  const W = 480;
  const H = 854;
  const FPS = 30;

  const filterComplex = [
    // Input 0: vertical video (with audio)
    `[0:v]split=2[v0_bg][v0_fg];[v0_bg]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},gblur=sigma=28:steps=2[v0_bg_s];[v0_fg]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[v0_fg_s];[v0_bg_s][v0_fg_s]overlay=(W-w)/2:(H-h)/2:shortest=1,fps=${FPS},format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v0]`,
    `[0:a]aresample=48000:async=1,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a0]`,
    // Input 1: TS video (no audio -> anullsrc)
    `[1:v]split=2[v1_bg][v1_fg];[v1_bg]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},gblur=sigma=28:steps=2[v1_bg_s];[v1_fg]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[v1_fg_s];[v1_bg_s][v1_fg_s]overlay=(W-w)/2:(H-h)/2:shortest=1,fps=${FPS},format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v1]`,
    `anullsrc=r=48000:cl=stereo,atrim=duration=2.000,asetpts=PTS-STARTPTS[a1]`,
    // Input 2: PNG image (3s duration, silent audio)
    `[2:v]split=2[v2_bg][v2_fg];[v2_bg]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},gblur=sigma=28:steps=2[v2_bg_s];[v2_fg]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[v2_fg_s];[v2_bg_s][v2_fg_s]overlay=(W-w)/2:(H-h)/2:shortest=1,fps=${FPS},format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v2]`,
    `anullsrc=r=48000:cl=stereo,atrim=duration=3.000,asetpts=PTS-STARTPTS[a2]`,
    // Concat + TikTok-style moving watermark
    `[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vconcat][aout]`,
    `[vconcat]drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='@MargeXStudio':fontsize=24:fontcolor=white@0.80:shadowcolor=black@0.64:shadowx=2:shadowy=2:x='if(eq(mod(floor(t/4.00),4),0),w*0.06,if(eq(mod(floor(t/4.00),4),1),w-tw-w*0.06,if(eq(mod(floor(t/4.00),4),2),w-tw-w*0.06,w*0.06)))':y='if(eq(mod(floor(t/4.00),4),0),h*0.08,if(eq(mod(floor(t/4.00),4),1),h-th-h*0.10,if(eq(mod(floor(t/4.00),4),2),h*0.15,h-th-h*0.16)))':enable='between(mod(t,4.00),0.3,2.30)'[vout]`,
  ].join(';');

  const t0 = Date.now();
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', v1,
    '-i', v2,
    '-loop', '1', '-framerate', String(FPS), '-t', '3.000', '-i', img1,
    '-filter_complex', filterComplex,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '19', '-b:v', '0',
    '-spatial-aq', '1', '-temporal-aq', '1', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    outMp4,
  ]);
  const elapsedMs = Date.now() - t0;

  // Verify output with ffprobe
  const probeRaw = execFileSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', outMp4,
  ], { encoding: 'utf8' });
  const probe = JSON.parse(probeRaw);
  const vs = probe.streams.find((s) => s.codec_type === 'video');
  const as = probe.streams.find((s) => s.codec_type === 'audio');

  console.log('SUCCESS! Merged MP4 + TS + PNG with NVENC Blurred Edge-to-Edge Fill:');
  console.log(`  Resolution: ${vs.width}x${vs.height} (expected ${W}x${H})`);
  console.log(`  Codec: ${vs.codec_name} | Audio: ${as.codec_name} ${as.sample_rate}Hz`);
  console.log(`  Duration: ${Number(probe.format.duration).toFixed(2)}s (expected ~7.00s)`);
  console.log(`  Render time (RTX NVENC): ${elapsedMs}ms`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
