import React from 'react';
import { Cpu, Film, FolderPlus, Layers, Trash2, Zap } from 'lucide-react';
import type { HardwareInfo } from '../../shared/types';

interface HeaderBarProps {
  hardware: HardwareInfo | null;
  itemCount: number;
  isRendering: boolean;
  onAddFiles: () => void;
  onClearAll: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  hardware,
  itemCount,
  isRendering,
  onAddFiles,
  onClearAll,
}) => {
  const hasNvenc = Boolean(hardware?.nvencH264 || hardware?.nvencHevc);

  return (
    <header className="h-14 shrink-0 border-b border-surface-700/80 bg-surface-900/95 px-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Layers className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white">MargeX</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-800 text-slate-400 border border-surface-700">
              v1.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-none mt-0.5">
            Edge-to-Edge Video & Image Merger Studio
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Hardware badge */}
        {hardware ? (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              !hardware.ready
                ? 'bg-red-500/10 text-red-300 border-red-500/30'
                : hasNvenc
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
            title={
              hardware.ready
                ? hasNvenc
                  ? `Hardware acceleration active: ${hardware.gpuName || 'NVIDIA NVENC'}`
                  : 'NVENC not detected; using CPU encoding'
                : hardware.error
            }
          >
            {hasNvenc ? (
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="max-w-[230px] truncate">
              {!hardware.ready
                ? 'FFmpeg Missing'
                : hasNvenc
                  ? `${hardware.gpuName || 'NVIDIA GPU'} • NVENC`
                  : 'CPU Mode'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-slate-400 bg-surface-800 border border-surface-700">
            <Film className="w-3.5 h-3.5 animate-pulse" />
            <span>Detecting GPU...</span>
          </div>
        )}

        <div className="h-5 w-px bg-surface-700" />

        <button
          type="button"
          disabled={isRendering}
          onClick={onAddFiles}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold transition-colors shadow-sm"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Add Media
        </button>

        {itemCount > 0 && (
          <button
            type="button"
            disabled={isRendering}
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-red-500/20 hover:text-red-300 border border-surface-700 hover:border-red-500/30 disabled:opacity-40 disabled:pointer-events-none text-slate-300 text-xs font-medium transition-colors"
            title="Clear all items"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>
    </header>
  );
};
