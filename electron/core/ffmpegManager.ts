import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { HardwareInfo } from '../../shared/types';

const execFileAsync = promisify(execFile);

let cachedInfo: HardwareInfo | null = null;

function findBinary(name: 'ffmpeg' | 'ffprobe'): string | null {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;

  // 1. Check bundled resources/bin (production or local bundle)
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', exe),
    path.join(process.cwd(), 'resources', 'bin', exe),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. Fallback to system PATH
  return exe;
}

async function verifyBinary(binPath: string): Promise<boolean> {
  try {
    await execFileAsync(binPath, ['-version'], { timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function detectNvidiaGpuName(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name', '--format=csv,noheader'],
      { timeout: 4000, windowsHide: true }
    );
    const firstLine = stdout.trim().split(/\r?\n/)[0]?.trim();
    return firstLine || null;
  } catch {
    return null;
  }
}

async function testNvencEncoder(ffmpegPath: string, encoder: 'h264_nvenc' | 'hevc_nvenc'): Promise<boolean> {
  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=256x256:d=0.1',
        '-c:v',
        encoder,
        '-f',
        'null',
        '-',
      ],
      { timeout: 8000, windowsHide: true }
    );
    return true;
  } catch {
    return false;
  }
}

export async function getHardwareInfo(forceRefresh = false): Promise<HardwareInfo> {
  if (cachedInfo && !forceRefresh) {
    return cachedInfo;
  }

  const ffmpegCandidate = findBinary('ffmpeg');
  const ffprobeCandidate = findBinary('ffprobe');

  const [ffmpegOk, ffprobeOk] = await Promise.all([
    ffmpegCandidate ? verifyBinary(ffmpegCandidate) : Promise.resolve(false),
    ffprobeCandidate ? verifyBinary(ffprobeCandidate) : Promise.resolve(false),
  ]);

  if (!ffmpegOk || !ffprobeOk || !ffmpegCandidate || !ffprobeCandidate) {
    cachedInfo = {
      ffmpegPath: ffmpegOk ? ffmpegCandidate : null,
      ffprobePath: ffprobeOk ? ffprobeCandidate : null,
      gpuName: null,
      nvencH264: false,
      nvencHevc: false,
      ready: false,
      error: 'FFmpeg or FFprobe was not found in resources/bin or system PATH.',
    };
    return cachedInfo;
  }

  const [gpuName, nvencH264, nvencHevc] = await Promise.all([
    detectNvidiaGpuName(),
    testNvencEncoder(ffmpegCandidate, 'h264_nvenc'),
    testNvencEncoder(ffmpegCandidate, 'hevc_nvenc'),
  ]);

  cachedInfo = {
    ffmpegPath: ffmpegCandidate,
    ffprobePath: ffprobeCandidate,
    gpuName,
    nvencH264,
    nvencHevc,
    ready: true,
  };

  return cachedInfo;
}
