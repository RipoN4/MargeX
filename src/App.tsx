import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type {
  HardwareInfo,
  MediaItem,
  ProjectSettings,
  RenderProgress,
  WatermarkSettings,
} from '../shared/types';
import {
  getMasterMediaItem,
  resolveOutputProfile,
} from '../electron/core/profileResolver';
import { HeaderBar } from './components/HeaderBar';
import { MediaQueue } from './components/MediaQueue';
import { RenderFooter } from './components/RenderFooter';
import { SettingsPanel } from './components/SettingsPanel';
import { SingleMediaStage } from './components/SingleMediaStage';

const WATERMARK_STORAGE_KEY = 'margex.watermark.preset.v1';

const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  text: '',
  size: 'medium',
  opacity: 0.75,
  displayDuration: 2.0,
  frequency: 'normal',
};

function loadSavedWatermark(): WatermarkSettings {
  try {
    const raw = localStorage.getItem(WATERMARK_STORAGE_KEY);
    if (!raw) return DEFAULT_WATERMARK;
    const parsed = JSON.parse(raw) as Partial<WatermarkSettings>;
    return {
      ...DEFAULT_WATERMARK,
      ...parsed,
    };
  } catch {
    return DEFAULT_WATERMARK;
  }
}

const INITIAL_SETTINGS: ProjectSettings = {
  resolutionMode: 'first-video',
  customWidth: 1920,
  customHeight: 1080,
  edgeMode: 'blur', // Blurred Edge-to-Edge Fill as default
  blurStrength: 28,
  defaultImageDuration: 2,
  useGpu: true,
  codec: 'h264',
  quality: 'high',
  outputFormat: 'mp4',
  targetFpsMode: 'auto',
  masterVideoId: null,
  watermark: loadSavedWatermark(),
};

const INITIAL_PROGRESS: RenderProgress = {
  state: 'idle',
  percent: 0,
  currentTimeSec: 0,
  totalDurationSec: 0,
  fps: 0,
  speed: '0x',
  etaSec: null,
  encoderUsed: '',
  stageLabel: '',
  logs: [],
};

// Keep images at the beginning by default while preserving relative order
function sortImagesFirst(list: MediaItem[]): MediaItem[] {
  const images = list.filter((i) => i.kind === 'image');
  const videos = list.filter((i) => i.kind !== 'image');
  return [...images, ...videos];
}

function isExternalFileDrag(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

export default function App() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>(INITIAL_SETTINGS);
  const [autoOutputPath, setAutoOutputPath] = useState<string | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [probeNotice, setProbeNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<RenderProgress>(INITIAL_PROGRESS);
  const [isDraggingExternalFiles, setIsDraggingExternalFiles] = useState(false);

  const dragCounterRef = useRef(0);
  const isRendering = progress.state === 'rendering';
  const isRenderingRef = useRef(isRendering);
  isRenderingRef.current = isRendering;

  useEffect(() => {
    window.margex.getHardwareInfo().then((info) => {
      setHardware(info);
      if (!info.nvencH264 && !info.nvencHevc) {
        setSettings((prev) => ({ ...prev, useGpu: false }));
      }
    });

    const unsub = window.margex.onRenderProgress((p) => {
      setProgress(p);
    });
    return unsub;
  }, []);

  const clearIdleNotice = useCallback(() => {
    setProgress((prev) =>
      prev.state === 'done' || prev.state === 'cancelled' || prev.state === 'error'
        ? INITIAL_PROGRESS
        : prev
    );
  }, []);

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      clearIdleNotice();
      setIsProbing(true);
      setProbeNotice(null);
      try {
        const { items: probed, errors } = await window.margex.probeFiles(paths);
        if (probed.length > 0) {
          setItems((prev) => sortImagesFirst([...prev, ...probed]));
          setSelectedId((prev) => prev ?? probed[0].id);
        }
        if (errors.length > 0) {
          setProbeNotice(`Skipped ${errors.length} file(s): ${errors[0]}`);
        }
      } finally {
        setIsProbing(false);
      }
    },
    [clearIdleNotice]
  );

  // Global bulletproof window-level file drag & drop (never gets stuck)
  useEffect(() => {
    const resetDrag = () => {
      dragCounterRef.current = 0;
      setIsDraggingExternalFiles(false);
    };

    const onDragEnter = (e: DragEvent) => {
      if (!isExternalFileDrag(e) || isRenderingRef.current) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDraggingExternalFiles(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = isRenderingRef.current ? 'none' : 'copy';
      }
    };

    const onDragLeave = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0 || !e.relatedTarget) {
        resetDrag();
      }
    };

    const onDrop = (e: DragEvent) => {
      const wasExternal = isExternalFileDrag(e);
      resetDrag();
      if (!wasExternal) return;
      e.preventDefault();
      if (isRenderingRef.current) return;

      const files = Array.from(e.dataTransfer?.files || []);
      const paths = files
        .map((f) => {
          try {
            return window.margex.getPathForFile(f);
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      if (paths.length > 0) {
        importPaths(paths);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('blur', resetDrag);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', resetDrag);
      window.removeEventListener('blur', resetDrag);
    };
  }, [importPaths]);

  const mainSourceItem = useMemo(
    () => getMasterMediaItem(items, settings.masterVideoId) ?? null,
    [items, settings.masterVideoId]
  );

  // Auto-resolve output path in source folder as <MainVideoName>_X.<ext>
  useEffect(() => {
    if (!mainSourceItem) {
      setAutoOutputPath(null);
      return;
    }
    let cancelled = false;
    window.margex
      .resolveAutoOutputPath(mainSourceItem.filePath, settings.outputFormat)
      .then((resolved) => {
        if (!cancelled) setAutoOutputPath(resolved);
      });
    return () => {
      cancelled = true;
    };
  }, [mainSourceItem, settings.outputFormat, progress.state]);

  const profile = useMemo(
    () => resolveOutputProfile(items, settings),
    [items, settings]
  );

  const selectedIndex = useMemo(() => {
    if (items.length === 0) return -1;
    const idx = items.findIndex((i) => i.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [items, selectedId]);

  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  const totalDurationSec = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          (item.kind === 'image'
            ? item.customDuration ?? settings.defaultImageDuration
            : item.duration),
        0
      ),
    [items, settings.defaultImageDuration]
  );

  const handleAddFiles = async () => {
    const paths = await window.margex.openMediaDialog();
    await importPaths(paths);
  };

  const handleMoveItem = (fromIndex: number, toIndex: number) => {
    clearIdleNotice();
    setItems((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  };

  const handleRemoveItem = (id: string) => {
    clearIdleNotice();
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
    if (settings.masterVideoId === id) {
      setSettings((prev) => ({ ...prev, masterVideoId: null }));
    }
  };

  const handleSetMainVideo = (id: string) => {
    clearIdleNotice();
    setSettings((prev) => ({ ...prev, masterVideoId: id }));
  };

  const handleUpdateItem = (id: string, patch: Partial<MediaItem>) => {
    clearIdleNotice();
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleUpdateSettings = (patch: Partial<ProjectSettings>) => {
    clearIdleNotice();
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveWatermarkPreset = (wm: WatermarkSettings) => {
    try {
      localStorage.setItem(WATERMARK_STORAGE_KEY, JSON.stringify(wm));
    } catch {
      // ignore storage quota errors
    }
  };

  const startRenderToPath = async (outputPath: string) => {
    const res = await window.margex.startRender({
      items,
      settings,
      outputPath,
    });
    if (!res.started && res.error) {
      setProgress({
        ...INITIAL_PROGRESS,
        state: 'error',
        error: res.error,
      });
    }
  };

  // Default 1-click export: saves to source folder with <MainVideo>_X.<ext>
  const handleExportAuto = async () => {
    if (items.length === 0 || isRendering || !mainSourceItem) return;
    const freshPath = await window.margex.resolveAutoOutputPath(
      mainSourceItem.filePath,
      settings.outputFormat
    );
    setAutoOutputPath(freshPath);
    await startRenderToPath(freshPath);
  };

  // Optional custom save path dialog
  const handleExportAs = async () => {
    if (items.length === 0 || isRendering) return;
    const defaultTarget =
      autoOutputPath || `MargeX_Merged_${new Date().toISOString().slice(0, 10)}`;
    const chosen = await window.margex.saveOutputDialog(
      defaultTarget,
      settings.outputFormat
    );
    if (!chosen) return;
    await startRenderToPath(chosen);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-surface-950 text-slate-100 overflow-hidden relative">
      {/* Global Drag & Drop Overlay (automatically clears on drop, leave, blur, or dragend) */}
      {isDraggingExternalFiles && !isRendering && (
        <div className="fixed inset-0 z-50 bg-blue-950/75 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none border-4 border-dashed border-blue-400 m-3 rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/50 flex items-center justify-center mb-3">
            <UploadCloud className="w-9 h-9 text-blue-300" />
          </div>
          <p className="text-base font-bold text-white">Drop Videos & Images to Add</p>
          <p className="text-xs text-blue-200/80 mt-1">
            Images are automatically placed at the beginning
          </p>
        </div>
      )}

      <HeaderBar
        hardware={hardware}
        itemCount={items.length}
        isRendering={isRendering}
        onAddFiles={handleAddFiles}
        onClearAll={() => {
          setItems([]);
          setSelectedId(null);
          setSettings((prev) => ({ ...prev, masterVideoId: null }));
          setProgress(INITIAL_PROGRESS);
        }}
      />

      {probeNotice && (
        <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
          <span>{probeNotice}</span>
          <button
            type="button"
            onClick={() => setProbeNotice(null)}
            className="text-amber-300 hover:text-white text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3-Column Studio Layout: Left Queue | Center Single Media Preview | Right Settings */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <MediaQueue
          items={items}
          selectedId={selectedItem?.id ?? null}
          mainVideoId={mainSourceItem?.id ?? null}
          settings={settings}
          isProbing={isProbing}
          isRendering={isRendering}
          onSelect={setSelectedId}
          onSetMainVideo={handleSetMainVideo}
          onAddFiles={handleAddFiles}
          onMoveItem={handleMoveItem}
          onRemoveItem={handleRemoveItem}
        />

        <SingleMediaStage
          item={selectedItem}
          itemIndex={selectedIndex}
          totalItems={items.length}
          isMainVideo={Boolean(
            selectedItem && mainSourceItem && selectedItem.id === mainSourceItem.id
          )}
          profile={profile}
          settings={settings}
          isRendering={isRendering}
          onAddFiles={handleAddFiles}
          onUpdateItem={handleUpdateItem}
          onSetMainVideo={handleSetMainVideo}
          onMoveItem={handleMoveItem}
          onRemoveItem={handleRemoveItem}
        />

        <SettingsPanel
          settings={settings}
          hardware={hardware}
          isRendering={isRendering}
          onChange={handleUpdateSettings}
          onSaveWatermarkPreset={handleSaveWatermarkPreset}
        />
      </main>

      <RenderFooter
        itemCount={items.length}
        totalDurationSec={totalDurationSec}
        profile={profile}
        progress={progress}
        autoOutputPath={autoOutputPath}
        canExport={Boolean(hardware?.ready)}
        onExport={handleExportAuto}
        onExportAs={handleExportAs}
        onCancel={() => window.margex.cancelRender()}
        onOpenOutput={(p) => window.margex.openFile(p)}
        onRevealOutput={(p) => window.margex.revealInFolder(p)}
      />
    </div>
  );
}
