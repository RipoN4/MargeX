import fs from 'node:fs';
import type {
  CropAlignment,
  EdgeToEdgeMode,
  MediaItem,
  ProjectSettings,
  ResolvedProfile,
  WatermarkSettings,
} from '../../shared/types';

function resolveWatermarkFont(): string {
  const candidates =
    process.platform === 'darwin'
      ? [
          '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
          '/Library/Fonts/Arial Bold.ttf',
          '/System/Library/Fonts/Helvetica.ttc',
        ]
      : process.platform === 'linux'
        ? [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
          ]
        : [
            'C:/Windows/Fonts/segoeuib.ttf',
            'C:/Windows/Fonts/arialbd.ttf',
            'C:/Windows/Fonts/arial.ttf',
            'C:/Windows/Fonts/segoeui.ttf',
          ];

  for (const font of candidates) {
    if (fs.existsSync(font)) {
      return font.replace(':', '\\:');
    }
  }
  return candidates[0].replace(':', '\\:');
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

export function buildWatermarkFilter(
  inputLabel: string,
  outputLabel: string,
  profile: ResolvedProfile,
  watermark: WatermarkSettings,
  timeOffsetSec = 0
): string | null {
  const rawText = (watermark?.text || '').trim();
  if (!watermark?.enabled || !rawText) return null;

  const shortSide = Math.min(profile.width, profile.height);
  const ratio =
    watermark.size === 'small' ? 0.036 : watermark.size === 'large' ? 0.065 : 0.048;
  const fontSize = Math.max(18, Math.min(72, Math.round(shortSide * ratio)));

  const opacity = Math.max(0.2, Math.min(1, watermark.opacity || 0.75)).toFixed(2);
  const shadowOpacity = Math.min(0.85, Number(opacity) * 0.8).toFixed(2);
  const dur = Math.max(1.0, Math.min(3.0, watermark.displayDuration || 2.5));
  const gap =
    watermark.frequency === 'frequent'
      ? 2.0
      : watermark.frequency === 'subtle'
        ? 8.5
        : 4.5;
  const period = (dur + gap).toFixed(2);
  const startDelay = 0.3;
  const endWindow = (startDelay + dur).toFixed(2);
  const tExpr = timeOffsetSec > 0 ? `(t+${timeOffsetSec.toFixed(3)})` : 't';
  const slotExpr = `mod(floor(${tExpr}/${period}),4)`;

  // 4 rotating screen sections (TikTok-style): Top-Left, Bottom-Right, Top-Right, Bottom-Left
  const xExpr = `if(eq(${slotExpr},0),w*0.06,if(eq(${slotExpr},1),w-tw-w*0.06,if(eq(${slotExpr},2),w-tw-w*0.06,w*0.06)))`;
  const yExpr = `if(eq(${slotExpr},0),h*0.08,if(eq(${slotExpr},1),h-th-h*0.10,if(eq(${slotExpr},2),h*0.15,h-th-h*0.16)))`;
  const enableExpr = `between(mod(${tExpr},${period}),${startDelay},${endWindow})`;

  const fontFile = resolveWatermarkFont();
  const safeText = escapeDrawtext(rawText);

  return (
    `${inputLabel}drawtext=` +
    `fontfile='${fontFile}':` +
    `text='${safeText}':` +
    `fontsize=${fontSize}:` +
    `fontcolor=white@${opacity}:` +
    `shadowcolor=black@${shadowOpacity}:shadowx=2:shadowy=2:` +
    `x='${xExpr}':` +
    `y='${yExpr}':` +
    `enable='${enableExpr}'` +
    `${outputLabel}`
  );
}

function getCropXY(alignment: CropAlignment = 'center'): { x: string; y: string } {
  switch (alignment) {
    case 'top':
      return { x: '(iw-ow)/2', y: '0' };
    case 'bottom':
      return { x: '(iw-ow)/2', y: 'ih-oh' };
    case 'left':
      return { x: '0', y: '(ih-oh)/2' };
    case 'right':
      return { x: 'iw-ow', y: '(ih-oh)/2' };
    case 'center':
    default:
      return { x: '(iw-ow)/2', y: '(ih-oh)/2' };
  }
}

export function getEffectiveDuration(item: MediaItem, settings: ProjectSettings): number {
  if (item.kind === 'image') {
    const d = item.customDuration ?? settings.defaultImageDuration;
    return Math.max(0.5, Number.isFinite(d) ? d : 4);
  }
  return Math.max(0.1, item.duration || 1);
}

export function buildVideoNormalizeFilter(
  inputLabel: string,
  outputLabel: string,
  profile: ResolvedProfile,
  mode: EdgeToEdgeMode,
  blurStrength: number,
  cropAlignment: CropAlignment = 'center'
): string {
  const { width: W, height: H, fps } = profile;
  const sigma = Math.max(5, Math.min(60, Math.round(blurStrength || 28)));

  if (mode === 'crop') {
    const { x, y } = getCropXY(cropAlignment);
    return (
      `${inputLabel}` +
      `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,` +
      `crop=${W}:${H}:${x}:${y},` +
      `fps=${fps},format=yuv420p,setsar=1,setpts=PTS-STARTPTS${outputLabel}`
    );
  }

  // Blurred Edge-to-Edge Fill (default)
  const bg = `${outputLabel.replace(/[[\]]/g, '')}_bg`;
  const fg = `${outputLabel.replace(/[[\]]/g, '')}_fg`;
  const bgScaled = `${bg}_s`;
  const fgScaled = `${fg}_s`;

  return [
    `${inputLabel}split=2[${bg}][${fg}]`,
    `[${bg}]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},gblur=sigma=${sigma}:steps=2[${bgScaled}]`,
    `[${fg}]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[${fgScaled}]`,
    `[${bgScaled}][${fgScaled}]overlay=(W-w)/2:(H-h)/2:shortest=1,fps=${fps},format=yuv420p,setsar=1,setpts=PTS-STARTPTS${outputLabel}`,
  ].join(';');
}

export function buildAudioNormalizeFilter(
  inputIndex: number,
  outputLabel: string,
  item: MediaItem,
  durationSec: number
): string {
  if (item.kind === 'video' && item.hasAudio) {
    return (
      `[${inputIndex}:a]` +
      `aresample=48000:async=1,` +
      `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `asetpts=PTS-STARTPTS${outputLabel}`
    );
  }

  return (
    `anullsrc=r=48000:cl=stereo,` +
    `atrim=duration=${durationSec.toFixed(3)},` +
    `asetpts=PTS-STARTPTS${outputLabel}`
  );
}

export function getEncoderArgs(
  settings: ProjectSettings,
  useNvenc: boolean
): { args: string[]; label: string } {
  const isHevc = settings.codec === 'hevc';

  if (useNvenc) {
    const encoder = isHevc ? 'hevc_nvenc' : 'h264_nvenc';
    const cq =
      settings.quality === 'high' ? '19' : settings.quality === 'balanced' ? '23' : '27';
    const preset = settings.quality === 'high' ? 'p6' : 'p5';

    const args = [
      '-c:v',
      encoder,
      '-preset',
      preset,
      '-rc',
      'vbr',
      '-cq',
      cq,
      '-b:v',
      '0',
      '-spatial-aq',
      '1',
      '-temporal-aq',
      '1',
      '-pix_fmt',
      'yuv420p',
    ];
    if (isHevc) {
      args.push('-tag:v', 'hvc1');
    }
    return {
      args,
      label: isHevc ? 'NVIDIA NVENC (HEVC)' : 'NVIDIA NVENC (H.264)',
    };
  }

  const encoder = isHevc ? 'libx265' : 'libx264';
  const crf =
    settings.quality === 'high' ? '18' : settings.quality === 'balanced' ? '22' : '26';
  const args = [
    '-c:v',
    encoder,
    '-preset',
    'medium',
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
  ];
  if (isHevc) {
    args.push('-tag:v', 'hvc1');
  }
  return {
    args,
    label: isHevc ? 'CPU (x265)' : 'CPU (x264)',
  };
}

export function buildSinglePassArgs(
  items: MediaItem[],
  settings: ProjectSettings,
  profile: ResolvedProfile,
  outputPath: string,
  useNvenc: boolean
): { args: string[]; encoderLabel: string; totalDurationSec: number } {
  const inputArgs: string[] = [];
  const filterChains: string[] = [];
  const concatInputs: string[] = [];
  let totalDurationSec = 0;

  items.forEach((item, idx) => {
    const dur = getEffectiveDuration(item, settings);
    totalDurationSec += dur;

    if (item.kind === 'image') {
      inputArgs.push(
        '-loop',
        '1',
        '-framerate',
        String(profile.fps),
        '-t',
        dur.toFixed(3),
        '-i',
        item.filePath
      );
    } else {
      inputArgs.push('-i', item.filePath);
    }

    const mode = item.edgeModeOverride ?? settings.edgeMode;
    const vFilter = buildVideoNormalizeFilter(
      `[${idx}:v]`,
      `[v${idx}]`,
      profile,
      mode,
      settings.blurStrength,
      item.cropAlignment
    );
    const aFilter = buildAudioNormalizeFilter(idx, `[a${idx}]`, item, dur);

    filterChains.push(vFilter, aFilter);
    concatInputs.push(`[v${idx}][a${idx}]`);
  });

  const wmFilter = buildWatermarkFilter('[vconcat]', '[vout]', profile, settings.watermark, 0);
  if (wmFilter) {
    filterChains.push(
      `${concatInputs.join('')}concat=n=${items.length}:v=1:a=1[vconcat][aout]`,
      wmFilter
    );
  } else {
    filterChains.push(
      `${concatInputs.join('')}concat=n=${items.length}:v=1:a=1[vout][aout]`
    );
  }

  const enc = getEncoderArgs(settings, useNvenc);

  const args: string[] = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    ...inputArgs,
    '-filter_complex',
    filterChains.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    ...enc.args,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
  ];

  if (settings.outputFormat === 'mp4') {
    args.push('-movflags', '+faststart');
  }

  args.push('-progress', 'pipe:1', '-nostats', outputPath);

  return {
    args,
    encoderLabel: enc.label,
    totalDurationSec,
  };
}

export function buildSingleClipArgs(
  item: MediaItem,
  settings: ProjectSettings,
  profile: ResolvedProfile,
  segmentPath: string,
  useNvenc: boolean,
  timeOffsetSec = 0
): { args: string[]; encoderLabel: string; durationSec: number } {
  const dur = getEffectiveDuration(item, settings);
  const inputArgs: string[] = [];

  if (item.kind === 'image') {
    inputArgs.push(
      '-loop',
      '1',
      '-framerate',
      String(profile.fps),
      '-t',
      dur.toFixed(3),
      '-i',
      item.filePath
    );
  } else {
    inputArgs.push('-i', item.filePath);
  }

  const mode = item.edgeModeOverride ?? settings.edgeMode;
  const wmFilter = buildWatermarkFilter('[vnorm]', '[vout]', profile, settings.watermark, timeOffsetSec);
  const vFilter = buildVideoNormalizeFilter(
    '[0:v]',
    wmFilter ? '[vnorm]' : '[vout]',
    profile,
    mode,
    settings.blurStrength,
    item.cropAlignment
  );
  const aFilter = buildAudioNormalizeFilter(0, '[aout]', item, dur);
  const enc = getEncoderArgs(settings, useNvenc);

  const filterGraph = wmFilter ? `${vFilter};${wmFilter};${aFilter}` : `${vFilter};${aFilter}`;

  const args: string[] = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    ...inputArgs,
    '-filter_complex',
    filterGraph,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    ...enc.args,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-progress',
    'pipe:1',
    '-nostats',
    segmentPath,
  ];

  return {
    args,
    encoderLabel: enc.label,
    durationSec: dur,
  };
}
