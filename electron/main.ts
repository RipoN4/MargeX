import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import type { OutputFormat, StartRenderRequest } from '../shared/types';
import { getHardwareInfo } from './core/ffmpegManager';
import { probeFiles } from './core/probeService';
import { RenderEngine } from './core/renderEngine';

const execFileAsync = promisify(execFile);

// Register custom media streaming scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'margex-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
const renderEngine = new RenderEngine();
let isRendering = false;
const previewCacheDir = path.join(os.tmpdir(), 'margex-previews');

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const DIRECT_PLAY_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.ogv']);

function makeMediaUrl(filePath: string): string {
  return `margex-media://local?path=${encodeURIComponent(filePath)}`;
}

function registerMediaProtocol() {
  protocol.handle('margex-media', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('File not found', { status: 404 });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_MAP[ext] || 'application/octet-stream';
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
          const chunkSize = end - start + 1;

          const nodeStream = fs.createReadStream(filePath, { start, end });
          const webStream = Readable.toWeb(nodeStream) as ReadableStream;

          return new Response(webStream, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize),
              'Content-Type': contentType,
            },
          });
        }
      }

      const nodeStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new Response(webStream, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
        },
      });
    } catch {
      return new Response('Failed to stream media', { status: 500 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0a0b0f',
    title: 'MargeX — Video & Image Merger Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerMediaProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (isRendering) {
    renderEngine.cancel();
  }
  try {
    if (fs.existsSync(previewCacheDir)) {
      fs.rmSync(previewCacheDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('margex:getHardwareInfo', async () => {
  return getHardwareInfo();
});

ipcMain.handle('margex:openMediaDialog', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Videos & Images to Merge',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Videos & Images',
        extensions: [
          'mp4', 'mov', 'ts', 'm2ts', 'mts', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'mpg', 'mpeg', 'gif',
          'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif',
        ],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle(
  'margex:saveOutputDialog',
  async (_event, defaultName: string, format: OutputFormat) => {
    if (!mainWindow) return null;
    const ext = format === 'mkv' ? 'mkv' : 'mp4';
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Merged Video',
      defaultPath: defaultName.endsWith(`.${ext}`) ? defaultName : `${defaultName}.${ext}`,
      filters: [
        {
          name: ext === 'mkv' ? 'Matroska Video (*.mkv)' : 'MP4 Video (*.mp4)',
          extensions: [ext],
        },
      ],
    });
    return res.canceled ? null : res.filePath || null;
  }
);

ipcMain.handle(
  'margex:resolveAutoOutputPath',
  async (_event, sourceFilePath: string, format: OutputFormat) => {
    const ext = format === 'mkv' ? '.mkv' : '.mp4';
    const dir = path.dirname(sourceFilePath);
    const parsed = path.parse(sourceFilePath);
    const baseName = parsed.name || 'MargeX_Merged';

    let candidate = path.join(dir, `${baseName}_X${ext}`);
    let counter = 2;
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${baseName}_X${counter}${ext}`);
      counter++;
    }
    return candidate;
  }
);

ipcMain.handle(
  'margex:getPlayableVideoUrl',
  async (_event, filePath: string, forceTranscode = false) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!forceTranscode && DIRECT_PLAY_EXTS.has(ext)) {
      return makeMediaUrl(filePath);
    }

    const hw = await getHardwareInfo();
    if (!hw.ready || !hw.ffmpegPath) {
      return makeMediaUrl(filePath);
    }

    fs.mkdirSync(previewCacheDir, { recursive: true });
    const stat = fs.statSync(filePath);
    const hash = crypto
      .createHash('md5')
      .update(`${filePath}:${stat.size}:${stat.mtimeMs}`)
      .digest('hex');
    const cachedMp4 = path.join(previewCacheDir, `${hash}.mp4`);

    if (fs.existsSync(cachedMp4) && fs.statSync(cachedMp4).size > 0) {
      return makeMediaUrl(cachedMp4);
    }

    const videoArgs = hw.nvencH264
      ? ['-c:v', 'h264_nvenc', '-preset', 'p1', '-rc', 'vbr', '-cq', '28', '-b:v', '0']
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28'];

    try {
      await execFileAsync(
        hw.ffmpegPath,
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          filePath,
          '-vf',
          'scale=min(1280\\,iw):-2',
          ...videoArgs,
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          cachedMp4,
        ],
        { timeout: 60000, windowsHide: true }
      );
      return makeMediaUrl(cachedMp4);
    } catch {
      return makeMediaUrl(filePath);
    }
  }
);

ipcMain.handle('margex:probeFiles', async (_event, filePaths: string[]) => {
  return probeFiles(filePaths);
});

ipcMain.handle('margex:startRender', async (_event, req: StartRenderRequest) => {
  if (isRendering) {
    return { started: false, error: 'A render job is already in progress.' };
  }
  if (!req.items || req.items.length === 0) {
    return { started: false, error: 'Please add at least one video or image.' };
  }

  isRendering = true;
  renderEngine
    .render(req, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('margex:renderProgress', progress);
      }
    })
    .finally(() => {
      isRendering = false;
    });

  return { started: true };
});

ipcMain.handle('margex:cancelRender', async () => {
  renderEngine.cancel();
});

ipcMain.handle('margex:revealInFolder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('margex:openFile', async (_event, filePath: string) => {
  await shell.openPath(filePath);
});
