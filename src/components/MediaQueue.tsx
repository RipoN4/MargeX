import React, { useState } from 'react';
import {
  Crown,
  Film,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import type { MediaItem, ProjectSettings } from '../../shared/types';
import { formatDuration } from '../utils/format';

interface MediaQueueProps {
  items: MediaItem[];
  selectedId: string | null;
  mainVideoId: string | null;
  settings: ProjectSettings;
  isProbing: boolean;
  isRendering: boolean;
  onSelect: (id: string) => void;
  onSetMainVideo: (id: string) => void;
  onAddFiles: () => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  onRemoveItem: (id: string) => void;
}

export const MediaQueue: React.FC<MediaQueueProps> = ({
  items,
  selectedId,
  mainVideoId,
  settings,
  isProbing,
  isRendering,
  onSelect,
  onSetMainVideo,
  onAddFiles,
  onMoveItem,
  onRemoveItem,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <aside className="w-[320px] shrink-0 border-r border-surface-800 flex flex-col min-h-0 bg-surface-900/50">
      {/* Left column header */}
      <div className="px-3.5 py-2.5 border-b border-surface-800 flex items-center justify-between bg-surface-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Media Files
          </h2>
          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-surface-800 text-slate-400">
            {items.length}
          </span>
          {isProbing && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
        </div>
        <button
          type="button"
          disabled={isRendering}
          onClick={onAddFiles}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-800 hover:bg-surface-700 border border-surface-700 text-[11px] font-medium text-slate-200 disabled:opacity-40"
          title="Add more videos or images"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-5 text-center text-xs text-slate-500">
          <p className="mb-1 text-slate-400 font-medium">No media added yet</p>
          <p className="text-[11px] leading-relaxed">
            Drop images & videos anywhere. Images are placed first automatically.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {items.map((item, idx) => {
            const isSelected = item.id === selectedId;
            const isMaster = item.id === mainVideoId;
            const effectiveDur =
              item.kind === 'image'
                ? item.customDuration ?? settings.defaultImageDuration
                : item.duration;

            return (
              <div
                key={item.id}
                draggable={!isRendering}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => {
                  if (dragIndex !== null) {
                    e.preventDefault();
                    setDragOverIndex(idx);
                  }
                }}
                onDragEnd={() => {
                  if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
                    onMoveItem(dragIndex, dragOverIndex);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onClick={() => onSelect(item.id)}
                className={`group rounded-xl border p-2 flex items-center gap-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface-800 border-blue-500/75 shadow-sm shadow-blue-950/40'
                    : 'bg-surface-900/70 border-surface-800/90 hover:border-surface-700 hover:bg-surface-900'
                } ${dragOverIndex === idx && dragIndex !== idx ? 'ring-2 ring-blue-400' : ''}`}
              >
                <div className="flex flex-col items-center gap-0.5 text-slate-600 shrink-0">
                  <GripVertical className="w-3.5 h-3.5 cursor-grab active:cursor-grabbing group-hover:text-slate-400" />
                  <span className="text-[9px] font-mono">{idx + 1}</span>
                </div>

                {/* Compact Thumbnail */}
                <div className="w-16 h-11 rounded-md bg-surface-950 border border-surface-700/80 overflow-hidden shrink-0 relative flex items-center justify-center">
                  {item.thumbnailDataUrl ? (
                    <img
                      src={item.thumbnailDataUrl}
                      alt={item.fileName}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : item.kind === 'image' ? (
                    <ImageIcon className="w-4 h-4 text-slate-600" />
                  ) : (
                    <Film className="w-4 h-4 text-slate-600" />
                  )}
                  <span
                    className={`absolute top-0.5 left-0.5 px-1 py-0.2 rounded text-[8px] font-bold uppercase ${
                      item.kind === 'image'
                        ? 'bg-purple-600/90 text-white'
                        : 'bg-blue-600/90 text-white'
                    }`}
                  >
                    {item.kind === 'image' ? 'IMG' : 'VID'}
                  </span>
                </div>

                {/* Compact Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium text-slate-100 truncate" title={item.fileName}>
                      {item.fileName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                    <span className="font-mono text-slate-300">
                      {item.width}×{item.height}
                    </span>
                    <span>•</span>
                    <span className="font-mono">{formatDuration(effectiveDur)}</span>
                    {isMaster && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1 rounded bg-amber-500/15 text-amber-300 font-semibold text-[9px]"
                        title="Main Video (sets aspect ratio & output filename)"
                      >
                        <Crown className="w-2.5 h-2.5" />
                        Main
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons: Set Main + Remove */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {item.kind === 'video' && !isMaster && (
                    <button
                      type="button"
                      disabled={isRendering}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetMainVideo(item.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition-opacity disabled:opacity-0"
                      title="Set as Main Video"
                    >
                      <Crown className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isRendering}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(item.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-opacity disabled:opacity-0"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};
