import type { MediaItem, ProjectSettings, ResolvedProfile } from '../../shared/types';

export function toEven(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function formatAspectLabel(width: number, height: number): string {
  const ratio = width / height;
  const known: Array<[number, string]> = [
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
    [4 / 3, '4:3'],
    [3 / 4, '3:4'],
    [1, '1:1'],
    [21 / 9, '21:9'],
    [4 / 5, '4:5'],
    [5 / 4, '5:4'],
    [3 / 2, '3:2'],
    [2 / 3, '2:3'],
  ];

  for (const [val, label] of known) {
    if (Math.abs(ratio - val) < 0.03) return label;
  }

  const d = gcd(width, height);
  const w = Math.round(width / d);
  const h = Math.round(height / d);
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return `${ratio.toFixed(2)}:1`;
}

export function getMasterMediaItem(
  items: MediaItem[],
  masterVideoId?: string | null
): MediaItem | undefined {
  if (masterVideoId) {
    const chosen = items.find((item) => item.id === masterVideoId);
    if (chosen) return chosen;
  }
  return items.find((item) => item.kind === 'video') || items[0];
}

export function resolveOutputProfile(
  items: MediaItem[],
  settings: ProjectSettings
): ResolvedProfile {
  const videos = items.filter((item) => item.kind === 'video');
  const master = getMasterMediaItem(items, settings.masterVideoId);

  if (!master) {
    return {
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: 16 / 9,
      aspectLabel: '16:9',
      orientation: 'landscape',
      sourceDescription: 'Default 1080p',
    };
  }

  // Main video aspect ratio is always respected for First Video & Best Quality modes
  const masterAspect = master.width / master.height;

  let targetWidth = master.width;
  let targetHeight = master.height;
  let sourceDescription = `First Video (${master.fileName})`;

  if (settings.resolutionMode === 'custom') {
    targetWidth = Math.min(3840, Math.max(128, settings.customWidth || 1920));
    targetHeight = Math.min(3840, Math.max(128, settings.customHeight || 1080));
    sourceDescription = 'Custom Resolution';
  } else if (settings.resolutionMode === 'best-quality') {
    // Pick the highest resolution available while maintaining the master video's aspect ratio
    const pool = videos.length > 0 ? videos : items;
    let bestLongSide = Math.max(master.width, master.height);
    let bestClipName = master.fileName;

    for (const clip of pool) {
      const longSide = Math.max(clip.width, clip.height);
      if (longSide > bestLongSide) {
        bestLongSide = longSide;
        bestClipName = clip.fileName;
      }
    }

    // Cap extreme image sizes (e.g., 6000px photos) when queue is image-only
    bestLongSide = Math.min(bestLongSide, 3840);

    if (masterAspect >= 1) {
      targetWidth = bestLongSide;
      targetHeight = bestLongSide / masterAspect;
    } else {
      targetHeight = bestLongSide;
      targetWidth = bestLongSide * masterAspect;
    }

    sourceDescription = `Best Quality (${bestClipName}) • Main Aspect`;
  } else {
    // first-video / main-video mode
    sourceDescription =
      master.kind === 'video'
        ? `Main Video (${master.fileName})`
        : `Main Image (${master.fileName})`;
  }

  const width = toEven(targetWidth);
  const height = toEven(targetHeight);

  let fps = 30;
  if (settings.targetFpsMode === '30') {
    fps = 30;
  } else if (settings.targetFpsMode === '60') {
    fps = 60;
  } else {
    // Auto: use master video FPS clamped cleanly to [24, 60]
    const rawFps = master.kind === 'video' ? master.fps : 30;
    fps = Math.min(60, Math.max(24, Math.round(rawFps)));
  }

  const aspectRatio = width / height;
  const orientation =
    Math.abs(aspectRatio - 1) < 0.03
      ? 'square'
      : aspectRatio > 1
        ? 'landscape'
        : 'portrait';

  return {
    width,
    height,
    fps,
    aspectRatio,
    aspectLabel: formatAspectLabel(width, height),
    orientation,
    sourceDescription,
  };
}
