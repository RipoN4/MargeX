import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RenderProgress, StartRenderRequest } from '../../shared/types';
import { getHardwareInfo } from './ffmpegManager';
import {
  buildSingleClipArgs,
  buildSinglePassArgs,
  getEffectiveDuration,
} from './filterBuilder';
import { resolveOutputProfile } from './profileResolver';

const CHUNKED_PIPELINE_THRESHOLD = 16;

export class RenderEngine {
  private activeProcess: ChildProcess | null = null;
  private cancelled = false;
  private logs: string[] = [];

  private pushLog(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.logs.push(trimmed);
    if (this.logs.length > 80) {
      this.logs = this.logs.slice(-80);
    }
  }

  public cancel() {
    this.cancelled = true;
    const proc = this.activeProcess;
    if (!proc) return;

    const pid = proc.pid;
    if (process.platform === 'win32' && pid) {
      // Kill the entire process tree on Windows (handles shim wrappers like Chocolatey ffmpeg.exe)
      try {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {
        // fallback below
      }
    }

    try {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
  }

  private runFfmpeg(
    ffmpegPath: string,
    args: string[],
    onProgressLine: (key: string, value: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { windowsHide: true });
      this.activeProcess = child;

      let stdoutBuf = '';
      let stderrBuf = '';

      child.stdout.on('data', (chunk: Buffer) => {
        if (this.cancelled) return;
        stdoutBuf += chunk.toString('utf8');
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() || '';
        for (const line of lines) {
          const eq = line.indexOf('=');
          if (eq !== -1) {
            onProgressLine(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderrBuf += text;
        for (const line of text.split(/\r?\n/)) {
          this.pushLog(line);
        }
      });

      child.on('error', (err) => {
        this.activeProcess = null;
        reject(err);
      });

      child.on('close', (code) => {
        this.activeProcess = null;
        if (this.cancelled) {
          reject(new Error('CANCELLED'));
        } else if (code === 0) {
          resolve();
        } else {
          const lastErr = stderrBuf
            .trim()
            .split(/\r?\n/)
            .slice(-4)
            .join(' | ');
          reject(new Error(lastErr || `FFmpeg exited with code ${code}`));
        }
      });
    });
  }

  public async render(
    req: StartRenderRequest,
    emit: (progress: RenderProgress) => void
  ): Promise<void> {
    this.cancelled = false;
    this.logs = [];

    const hw = await getHardwareInfo();
    if (!hw.ready || !hw.ffmpegPath) {
      emit({
        state: 'error',
        percent: 0,
        currentTimeSec: 0,
        totalDurationSec: 0,
        fps: 0,
        speed: '0x',
        etaSec: null,
        encoderUsed: 'None',
        stageLabel: 'Failed',
        error: hw.error || 'FFmpeg not found',
        logs: [...this.logs],
      });
      return;
    }

    const { items, settings, outputPath } = req;
    const profile = resolveOutputProfile(items, settings);
    const totalDurationSec = items.reduce(
      (sum, item) => sum + getEffectiveDuration(item, settings),
      0
    );

    const canNvenc =
      settings.useGpu &&
      (settings.codec === 'hevc' ? hw.nvencHevc : hw.nvencH264);

    const attemptRender = async (useNvenc: boolean) => {
      if (items.length <= CHUNKED_PIPELINE_THRESHOLD) {
        await this.runSinglePass(
          hw.ffmpegPath!,
          req,
          profile,
          totalDurationSec,
          useNvenc,
          emit
        );
      } else {
        await this.runChunkedPass(
          hw.ffmpegPath!,
          req,
          profile,
          totalDurationSec,
          useNvenc,
          emit
        );
      }
    };

    try {
      await attemptRender(canNvenc);
      emit({
        state: 'done',
        percent: 100,
        currentTimeSec: totalDurationSec,
        totalDurationSec,
        fps: 0,
        speed: 'Done',
        etaSec: 0,
        encoderUsed: canNvenc
          ? settings.codec === 'hevc'
            ? 'NVIDIA NVENC (HEVC)'
            : 'NVIDIA NVENC (H.264)'
          : settings.codec === 'hevc'
            ? 'CPU (x265)'
            : 'CPU (x264)',
        stageLabel: 'Export Complete',
        outputPath,
        logs: [...this.logs],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.cancelled || message === 'CANCELLED') {
        const removePartial = () => {
          try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch {
            // retry once after Windows releases file handle
            setTimeout(() => {
              try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
              } catch {
                // ignore
              }
            }, 300);
          }
        };
        removePartial();
        emit({
          state: 'cancelled',
          percent: 0,
          currentTimeSec: 0,
          totalDurationSec,
          fps: 0,
          speed: '0x',
          etaSec: null,
          encoderUsed: '',
          stageLabel: 'Cancelled',
          logs: [...this.logs],
        });
        return;
      }

      // Automatic fallback from NVENC to CPU if GPU encoding failed
      if (canNvenc) {
        this.pushLog(`NVENC failed (${message}). Falling back to CPU encoder...`);
        try {
          await attemptRender(false);
          emit({
            state: 'done',
            percent: 100,
            currentTimeSec: totalDurationSec,
            totalDurationSec,
            fps: 0,
            speed: 'Done',
            etaSec: 0,
            encoderUsed:
              settings.codec === 'hevc' ? 'CPU (x265 Fallback)' : 'CPU (x264 Fallback)',
            stageLabel: 'Export Complete (CPU Fallback)',
            outputPath,
            logs: [...this.logs],
          });
          return;
        } catch (fallbackErr) {
          const fbMsg =
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          emit({
            state: 'error',
            percent: 0,
            currentTimeSec: 0,
            totalDurationSec,
            fps: 0,
            speed: '0x',
            etaSec: null,
            encoderUsed: 'CPU Fallback',
            stageLabel: 'Error',
            error: fbMsg,
            logs: [...this.logs],
          });
          return;
        }
      }

      emit({
        state: 'error',
        percent: 0,
        currentTimeSec: 0,
        totalDurationSec,
        fps: 0,
        speed: '0x',
        etaSec: null,
        encoderUsed: canNvenc ? 'NVIDIA NVENC' : 'CPU',
        stageLabel: 'Error',
        error: message,
        logs: [...this.logs],
      });
    }
  }

  private async runSinglePass(
    ffmpegPath: string,
    req: StartRenderRequest,
    profile: ReturnType<typeof resolveOutputProfile>,
    totalDurationSec: number,
    useNvenc: boolean,
    emit: (progress: RenderProgress) => void
  ) {
    const { args, encoderLabel } = buildSinglePassArgs(
      req.items,
      req.settings,
      profile,
      req.outputPath,
      useNvenc
    );

    let currentSec = 0;
    let currentFps = 0;
    let currentSpeed = '0x';

    emit({
      state: 'rendering',
      percent: 0,
      currentTimeSec: 0,
      totalDurationSec,
      fps: 0,
      speed: 'Starting...',
      etaSec: null,
      encoderUsed: encoderLabel,
      stageLabel: `Merging ${req.items.length} clips (${profile.width}×${profile.height})`,
      logs: [...this.logs],
    });

    await this.runFfmpeg(ffmpegPath, args, (key, value) => {
      if (key === 'out_time_us' || key === 'out_time_ms') {
        const us = Number(value);
        if (Number.isFinite(us) && us >= 0) {
          currentSec = us / 1_000_000;
        }
      } else if (key === 'fps') {
        const f = Number(value);
        if (Number.isFinite(f)) currentFps = Math.round(f);
      } else if (key === 'speed') {
        currentSpeed = value;
      } else if (key === 'progress') {
        const pct = Math.min(99, Math.max(0, (currentSec / Math.max(0.1, totalDurationSec)) * 100));
        const speedNum = parseFloat(currentSpeed.replace('x', ''));
        const etaSec =
          Number.isFinite(speedNum) && speedNum > 0.05
            ? Math.max(0, (totalDurationSec - currentSec) / speedNum)
            : null;

        emit({
          state: 'rendering',
          percent: Math.round(pct * 10) / 10,
          currentTimeSec: currentSec,
          totalDurationSec,
          fps: currentFps,
          speed: currentSpeed,
          etaSec,
          encoderUsed: encoderLabel,
          stageLabel: `Merging ${req.items.length} clips (${profile.width}×${profile.height})`,
          logs: [...this.logs],
        });
      }
    });
  }

  private async runChunkedPass(
    ffmpegPath: string,
    req: StartRenderRequest,
    profile: ReturnType<typeof resolveOutputProfile>,
    totalDurationSec: number,
    useNvenc: boolean,
    emit: (progress: RenderProgress) => void
  ) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'margex-'));
    const segmentPaths: string[] = [];
    let completedSec = 0;

    try {
      for (let i = 0; i < req.items.length; i++) {
        if (this.cancelled) throw new Error('CANCELLED');

        const item = req.items[i];
        const segExt = req.settings.outputFormat === 'mkv' ? 'mkv' : 'mp4';
        const segPath = path.join(tempDir, `seg_${String(i).padStart(4, '0')}.${segExt}`);
        segmentPaths.push(segPath);

        const { args, encoderLabel, durationSec } = buildSingleClipArgs(
          item,
          req.settings,
          profile,
          segPath,
          useNvenc,
          completedSec
        );

        let clipSec = 0;
        let currentFps = 0;
        let currentSpeed = '0x';

        await this.runFfmpeg(ffmpegPath, args, (key, value) => {
          if (key === 'out_time_us' || key === 'out_time_ms') {
            const us = Number(value);
            if (Number.isFinite(us) && us >= 0) clipSec = us / 1_000_000;
          } else if (key === 'fps') {
            const f = Number(value);
            if (Number.isFinite(f)) currentFps = Math.round(f);
          } else if (key === 'speed') {
            currentSpeed = value;
          } else if (key === 'progress') {
            const totalDone = completedSec + clipSec;
            const pct = Math.min(96, (totalDone / Math.max(0.1, totalDurationSec)) * 96);
            emit({
              state: 'rendering',
              percent: Math.round(pct * 10) / 10,
              currentTimeSec: totalDone,
              totalDurationSec,
              fps: currentFps,
              speed: currentSpeed,
              etaSec: null,
              encoderUsed: encoderLabel,
              stageLabel: `Processing clip ${i + 1}/${req.items.length}: ${item.fileName}`,
              logs: [...this.logs],
            });
          }
        });

        completedSec += durationSec;
      }

      // Stage 2: Instant stream-copy concat
      const concatListPath = path.join(tempDir, 'concat.txt');
      const concatContent = segmentPaths
        .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
        .join('\n');
      fs.writeFileSync(concatListPath, concatContent, 'utf8');

      emit({
        state: 'rendering',
        percent: 97,
        currentTimeSec: totalDurationSec,
        totalDurationSec,
        fps: 0,
        speed: 'Copy',
        etaSec: 2,
        encoderUsed: 'Stream Copy Merge',
        stageLabel: 'Joining normalized segments...',
        logs: [...this.logs],
      });

      const concatArgs = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'warning',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c',
        'copy',
      ];
      if (req.settings.outputFormat === 'mp4') {
        concatArgs.push('-movflags', '+faststart');
      }
      concatArgs.push(req.outputPath);

      await this.runFfmpeg(ffmpegPath, concatArgs, () => {});
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }
}
