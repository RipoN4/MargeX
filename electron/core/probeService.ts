import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { MediaItem, MediaKind } from '../../shared/types';
import { getHardwareInfo } from './ffmpegManager';

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.heic',
  '.heif',
  '.avif',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.ts',
  '.m2ts',
  '.mts',
  '.mkv',
  '.avi',
  '.webm',
  '.flv',
  '.wmv',
  '.m4v',
  '.3gp',
  '.mpg',
  '.mpeg',
  '.ogv',
  '.gif',
]);

export function classifyMediaKind(filePath: string): MediaKind | null {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

function parseFrameRate(raw?: string): number {
  if (!raw || raw === '0/0') return 30;
  const parts = raw.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0 && Number.isFinite(num / den)) {
      const val = num / den;
      if (val >= 1 && val <= 240) return Math.round(val * 100) / 100;
    }
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 240 ? parsed : 30;
}

function extractRotation(stream: Record<string, unknown>): number {
  const tags = stream.tags as Record<string, unknown> | undefined;
  if (tags && tags.rotate !== undefined) {
    const r = Number(tags.rotate);
    if (Number.isFinite(r)) return Math.abs(r) % 360;
  }
  const sideDataList = stream.side_data_list as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(sideDataList)) {
    for (const sd of sideDataList) {
      if (sd.rotation !== undefined) {
        const r = Number(sd.rotation);
        if (Number.isFinite(r)) return Math.abs(r) % 360;
      }
    }
  }
  return 0;
}

async function generateThumbnail(
  ffmpegPath: string,
  filePath: string,
  kind: MediaKind,
  duration: number
): Promise<string> {
  try {
    const seekSec = kind === 'video' ? Math.min(Math.max(duration * 0.15, 0), 3) : 0;
    const args: string[] = ['-hide_banner', '-loglevel', 'error'];
    if (kind === 'video' && seekSec > 0) {
      args.push('-ss', seekSec.toFixed(2));
    }
    args.push(
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-2:force_original_aspect_ratio=decrease',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-q:v',
      '5',
      'pipe:1'
    );

    const { stdout } = await execFileAsync(ffmpegPath, args, {
      encoding: 'buffer',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 10000,
      windowsHide: true,
    });

    if (stdout && stdout.length > 0) {
      return `data:image/jpeg;base64,${stdout.toString('base64')}`;
    }
  } catch {
    // Fallback to empty thumbnail
  }
  return '';
}

export async function probeSingleFile(filePath: string): Promise<MediaItem> {
  const hw = await getHardwareInfo();
  if (!hw.ready || !hw.ffprobePath || !hw.ffmpegPath) {
    throw new Error(hw.error || 'FFmpeg/FFprobe not available');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const kind = classifyMediaKind(filePath);
  if (!kind) {
    throw new Error(`Unsupported file format: ${ext || path.basename(filePath)}`);
  }

  const { stdout } = await execFileAsync(
    hw.ffprobePath,
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ],
    { timeout: 15000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }
  );

  const data = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };

  const streams = data.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error(`No video or image stream found in ${path.basename(filePath)}`);
  }

  let width = Number(videoStream.width) || 0;
  let height = Number(videoStream.height) || 0;
  const rotation = extractRotation(videoStream);
  if (rotation === 90 || rotation === 270) {
    [width, height] = [height, width];
  }

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid dimensions for ${path.basename(filePath)}`);
  }

  let duration = 2; // default for images
  if (kind === 'video') {
    const rawDur =
      Number(data.format?.duration) ||
      Number(videoStream.duration) ||
      0;
    duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 1;
  }

  const fps =
    kind === 'video'
      ? parseFrameRate(
          (videoStream.avg_frame_rate as string) || (videoStream.r_frame_rate as string)
        )
      : 30;

  const thumbnailDataUrl = await generateThumbnail(hw.ffmpegPath, filePath, kind, duration);

  return {
    id: crypto.randomUUID(),
    filePath,
    fileName: path.basename(filePath),
    ext: ext.replace('.', '').toUpperCase(),
    kind,
    width,
    height,
    fps,
    duration,
    hasAudio: kind === 'video' && Boolean(audioStream),
    codec: String(videoStream.codec_name || 'unknown').toUpperCase(),
    fileSize: stat.size,
    thumbnailDataUrl,
  };
}

export async function probeFiles(filePaths: string[]): Promise<{
  items: MediaItem[];
  errors: string[];
}> {
  const items: MediaItem[] = [];
  const errors: string[] = [];

  for (const fp of filePaths) {
    try {
      const item = await probeSingleFile(fp);
      items.push(item);
    } catch (err) {
      errors.push(`${path.basename(fp)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { items, errors };
}
