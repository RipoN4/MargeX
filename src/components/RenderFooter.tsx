import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Play,
  Square,
  Terminal,
} from 'lucide-react';
import type { RenderProgress, ResolvedProfile } from '../../shared/types';
import { formatDuration } from '../utils/format';

interface RenderFooterProps {
  itemCount: number;
  totalDurationSec: number;
  profile: ResolvedProfile;
  progress: RenderProgress;
  autoOutputPath: string | null;
  canExport: boolean;
  onExport: () => void;
  onExportAs: () => void;
  onCancel: () => void;
  onOpenOutput: (filePath: string) => void;
  onRevealOutput: (filePath: string) => void;
}

export const RenderFooter: React.FC<RenderFooterProps> = ({
  itemCount,
  totalDurationSec,
  profile,
  progress,
  autoOutputPath,
  canExport,
  onExport,
  onExportAs,
  onCancel,
  onOpenOutput,
  onRevealOutput,
}) => {
  const [showLogs, setShowLogs] = useState(false);
  const isRendering = progress.state === 'rendering';

  const shortOutputName = autoOutputPath
    ? autoOutputPath.split(/[\\/]/).pop()
    : null;

  return (
    <footer className="shrink-0 border-t border-surface-700/80 bg-surface-900/95 px-5 py-3">
      {/* Collapsible FFmpeg logs */}
      {showLogs && progress.logs.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-surface-950 border border-surface-800 max-h-28 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-0.5 select-text">
          {progress.logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Active progress bar */}
      {isRendering && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2 text-slate-200 font-medium">
              <span>{progress.stageLabel}</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">
                {progress.encoderUsed}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              {progress.fps > 0 && <span>{progress.fps} fps</span>}
              {progress.speed && <span>{progress.speed}</span>}
              {progress.etaSec !== null && <span>ETA {formatDuration(progress.etaSec)}</span>}
              <span className="text-blue-400 font-bold">{progress.percent.toFixed(1)}%</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-200"
              style={{ width: `${Math.max(2, progress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Done / Error Banner */}
      {progress.state === 'done' && progress.outputPath && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-emerald-200 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium shrink-0">Saved ({progress.encoderUsed}):</span>
            <span className="truncate text-emerald-300/80 font-mono">{progress.outputPath}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              type="button"
              onClick={() => onOpenOutput(progress.outputPath!)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              <Play className="w-3 h-3" />
              Play
            </button>
            <button
              type="button"
              onClick={() => onRevealOutput(progress.outputPath!)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-800 hover:bg-surface-700 text-slate-200 text-xs font-medium border border-surface-700"
            >
              <FolderOpen className="w-3 h-3" />
              Folder
            </button>
          </div>
        </div>
      )}

      {progress.state === 'cancelled' && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
          <span>Render cancelled. No partial output file was kept.</span>
        </div>
      )}

      {progress.state === 'error' && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-red-200 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="truncate">{progress.error || 'Rendering failed.'}</span>
          </div>
          {progress.logs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLogs((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-800 text-slate-300 text-[11px] shrink-0"
            >
              <Terminal className="w-3 h-3" />
              {showLogs ? 'Hide Logs' : 'View Logs'}
            </button>
          )}
        </div>
      )}

      {/* Main action row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs text-slate-400 min-w-0">
          <span className="shrink-0">
            <strong className="text-slate-200 font-mono">
              {profile.width}×{profile.height}
            </strong>{' '}
            ({profile.aspectLabel}, {profile.fps} fps)
          </span>
          <span className="text-surface-700">•</span>
          <span className="shrink-0">
            Duration:{' '}
            <strong className="text-slate-200 font-mono">
              {formatDuration(totalDurationSec)}
            </strong>
          </span>
          {shortOutputName && (
            <>
              <span className="text-surface-700">•</span>
              <span
                className="truncate text-[11px] text-slate-400 font-mono"
                title={autoOutputPath || ''}
              >
                Save as: <strong className="text-blue-300">{shortOutputName}</strong>
              </span>
            </>
          )}
          {progress.logs.length > 0 && progress.state !== 'error' && (
            <button
              type="button"
              onClick={() => setShowLogs((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 shrink-0"
            >
              <Terminal className="w-3 h-3" />
              Logs
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRendering ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Cancel Render
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!canExport || itemCount === 0}
                onClick={onExportAs}
                className="px-3 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-700 disabled:opacity-40 disabled:pointer-events-none text-slate-300 text-xs font-medium transition-colors"
                title="Choose a custom folder or filename"
              >
                Save As...
              </button>
              <button
                type="button"
                disabled={!canExport || itemCount === 0}
                onClick={onExport}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all"
                title="Automatically saves in source folder as <MainVideo>_X"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Merge & Export
              </button>
            </>
          )}
        </div>
      </div>
    </footer>
  );
};
