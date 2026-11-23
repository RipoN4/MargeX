import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Crop,
  Crown,
  Eye,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pause,
  Play,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  CropAlignment,
  EdgeToEdgeMode,
  MediaItem,
  ProjectSettings,
  ResolvedProfile,
} from '../../shared/types';
import { formatAspectLabel } from '../../electron/core/profileResolver';
import { formatDuration, formatFileSize } from '../utils/format';

interface SingleMediaStageProps {
  item: MediaItem | null;
  itemIndex: number;
  totalItems: number;
  isMainVideo: boolean;
  profile: ResolvedProfile;
  settings: ProjectSettings;
  isRendering: boolean;
  onAddFiles: () => void;
  onUpdateItem: (id: string, patch: Partial<MediaItem>) => void;
  onSetMainVideo: (id: string) => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  onRemoveItem: (id: string) => void;
}

function alignmentToObjectPosition(alignment: CropAlignment = 'center'): string {
  switch (alignment) {
    case 'top':
      return 'center top';
    case 'bottom':
      return 'center bottom';
    case 'left':
      return 'left center';
    case 'right':
      return 'right center';
    default:
      return 'center center';
  }
}

const WATERMARK_POSITIONS = [
  'top-[8%] left-[6%]',
  'bottom-[10%] right-[6%]',
  'top-[15%] right-[6%]',
  'bottom-[16%] left-[6%]',
];

export const SingleMediaStage: React.FC<SingleMediaStageProps> = ({
  item,
  itemIndex,
  totalItems,
  isMainVideo,
  profile,
  settings,
  isRendering,
  onAddFiles,
  onUpdateItem,
  onSetMainVideo,
  onMoveItem,
  onRemoveItem,
}) => {
  const [wmSlot, setWmSlot] = useState(0);

  // Video playback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [triedTranscodeFallback, setTriedTranscodeFallback] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playPauseFlash, setPlayPauseFlash] = useState<'play' | 'pause' | null>(null);

  // Load playable URL whenever selected video changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setVideoDuration(item?.duration || 0);
    setTriedTranscodeFallback(false);

    if (!item || item.kind !== 'video') {
      setVideoSrc(null);
      setIsLoadingVideo(false);
      return;
    }

    let cancelled = false;
    setIsLoadingVideo(true);
    setVideoSrc(null);

    window.margex
      .getPlayableVideoUrl(item.filePath, false)
      .then((url) => {
        if (!cancelled) {
          setVideoSrc(url);
          setIsLoadingVideo(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingVideo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.filePath, item?.kind]);

  // Subtle TikTok-style watermark position cycling in live preview
  useEffect(() => {
    if (!settings.watermark.enabled || !settings.watermark.text.trim()) return;
    const intervalMs = Math.max(1200, Math.round(settings.watermark.displayDuration * 1000));
    const timer = setInterval(() => {
      setWmSlot((prev) => (prev + 1) % 4);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [settings.watermark.enabled, settings.watermark.text, settings.watermark.displayDuration]);

  const handleVideoError = async () => {
    if (!item || item.kind !== 'video' || triedTranscodeFallback) return;
    setTriedTranscodeFallback(true);
    setIsLoadingVideo(true);
    try {
      const transcodedUrl = await window.margex.getPlayableVideoUrl(item.filePath, true);
      setVideoSrc(transcodedUrl);
    } finally {
      setIsLoadingVideo(false);
    }
  };

  const togglePlayPause = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlayPauseFlash('play');
    } else {
      el.pause();
      setPlayPauseFlash('pause');
    }
    setTimeout(() => setPlayPauseFlash(null), 450);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current && Number.isFinite(val)) {
      videoRef.current.currentTime = val;
    }
  };

  // Spacebar shortcut for Play/Pause when viewing a video
  useEffect(() => {
    if (!item || item.kind !== 'video') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item?.id, item?.kind]);

  if (!item) {
    return (
      <section className="flex-1 min-w-0 flex items-center justify-center p-8 bg-surface-950">
        <button
          type="button"
          onClick={onAddFiles}
          disabled={isRendering}
          className="w-full max-w-md rounded-2xl border-2 border-dashed border-surface-700 hover:border-blue-500/70 bg-surface-900/50 hover:bg-surface-900/90 p-10 flex flex-col items-center text-center transition-all group cursor-pointer"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface-800 group-hover:bg-blue-500/15 border border-surface-700 group-hover:border-blue-500/40 flex items-center justify-center mb-4 transition-colors">
            <UploadCloud className="w-7 h-7 text-slate-400 group-hover:text-blue-400 transition-colors" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            Drop Videos & Images Here
          </h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
            Images are automatically placed at the beginning. Mix MP4, MOV, TS, JPG, PNG, WebP in any resolution — output is always edge-to-edge.
          </p>
          <span className="px-4 py-2 rounded-lg bg-blue-600 group-hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
            Browse Files
          </span>
        </button>
      </section>
    );
  }

  const effectiveMode: EdgeToEdgeMode = item.edgeModeOverride ?? settings.edgeMode;
  const effectiveDuration =
    item.kind === 'image'
      ? item.customDuration ?? settings.defaultImageDuration
      : item.duration;

  const wmFontClass =
    settings.watermark.size === 'small'
      ? 'text-xs'
      : settings.watermark.size === 'large'
        ? 'text-lg'
        : 'text-sm';

  const maxSeek = Math.max(0.1, videoDuration || item.duration || 1);

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-surface-950 overflow-hidden relative">

      {/* Top Preview Header */}
      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-900/40 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 shrink-0">
            Media Preview
          </span>
          <span className="text-surface-700 shrink-0">•</span>
          {/* Full title hover tooltip */}
          <div className="relative group min-w-0">
            <span
              className="block text-xs text-slate-300 truncate cursor-default"
              title={item.fileName}
            >
              #{itemIndex + 1} {item.fileName}
            </span>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 top-full mt-1.5 z-50 max-w-md px-2.5 py-1.5 rounded-lg bg-surface-950 border border-surface-700 shadow-xl text-xs text-slate-100 break-all whitespace-normal">
              {item.fileName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-400">
          <span>
            Canvas: <strong className="text-slate-200">{profile.width}×{profile.height}</strong> ({profile.aspectLabel})
          </span>
        </div>
      </div>

      {/* Large Center Video / Image Player Canvas */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 overflow-hidden bg-[radial-gradient(circle_at_center,_#141824_0%,_#0a0b0f_75%)]">
        <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
          <div
            onClick={item.kind === 'video' ? togglePlayPause : undefined}
            style={{
              aspectRatio: `${profile.width} / ${profile.height}`,
              maxWidth: '100%',
              maxHeight: '100%',
              height: profile.height >= profile.width ? '100%' : 'auto',
              width: profile.width > profile.height ? '100%' : 'auto',
            }}
            className={`relative rounded-xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/15 flex items-center justify-center ${
              item.kind === 'video' ? 'cursor-pointer' : ''
            }`}
          >
            {/* Blurred background layer for Blurred Edge-to-Edge Fill */}
            {effectiveMode === 'blur' && item.thumbnailDataUrl && (
              <img
                src={item.thumbnailDataUrl}
                alt="Blurred backdrop"
                className="absolute inset-0 w-full h-full object-cover scale-110 pointer-events-none"
                style={{
                  filter: `blur(${Math.max(8, Math.round(settings.blurStrength * 0.65))}px)`,
                }}
              />
            )}

            {/* Foreground: Real Video Player OR Image */}
            {item.kind === 'video' ? (
              <>
                {videoSrc ? (
                  <video
                    key={videoSrc}
                    ref={videoRef}
                    src={videoSrc}
                    autoPlay
                    playsInline
                    muted={isMuted}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 0) setVideoDuration(d);
                    }}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onError={handleVideoError}
                    className={`relative z-10 w-full h-full ${
                      effectiveMode === 'crop' ? 'object-cover' : 'object-contain'
                    }`}
                    style={
                      effectiveMode === 'crop'
                        ? { objectPosition: alignmentToObjectPosition(item.cropAlignment) }
                        : undefined
                    }
                  />
                ) : item.thumbnailDataUrl ? (
                  <img
                    src={item.thumbnailDataUrl}
                    alt={item.fileName}
                    className={`relative z-10 w-full h-full ${
                      effectiveMode === 'crop' ? 'object-cover' : 'object-contain'
                    }`}
                  />
                ) : (
                  <Film className="relative z-10 w-8 h-8 text-slate-500" />
                )}

                {/* Transcoding/loading indicator */}
                {isLoadingVideo && (
                  <div className="absolute inset-0 z-30 bg-black/50 flex flex-col items-center justify-center gap-2 text-xs text-slate-200">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    <span>Preparing playable preview...</span>
                  </div>
                )}

                {/* Click Play/Pause Visual Feedback */}
                {playPauseFlash && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="w-14 h-14 rounded-full bg-black/65 backdrop-blur-sm flex items-center justify-center text-white shadow-xl">
                      {playPauseFlash === 'play' ? (
                        <Play className="w-7 h-7 fill-current ml-0.5" />
                      ) : (
                        <Pause className="w-7 h-7 fill-current" />
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : item.thumbnailDataUrl ? (
              <img
                src={item.thumbnailDataUrl}
                alt={item.fileName}
                className={`relative z-10 w-full h-full ${
                  effectiveMode === 'crop' ? 'object-cover' : 'object-contain'
                }`}
                style={
                  effectiveMode === 'crop'
                    ? { objectPosition: alignmentToObjectPosition(item.cropAlignment) }
                    : undefined
                }
              />
            ) : (
              <ImageIcon className="relative z-10 w-8 h-8 text-slate-500" />
            )}

            {/* Live Watermark Preview Overlay */}
            {settings.watermark.enabled && settings.watermark.text.trim() && (
              <div
                className={`absolute z-20 pointer-events-none font-bold text-white transition-all duration-300 ${wmFontClass} ${WATERMARK_POSITIONS[wmSlot]}`}
                style={{
                  opacity: settings.watermark.opacity,
                  textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                }}
              >
                {settings.watermark.text}
              </div>
            )}

            {/* Bottom-left framing badge */}
            <div className="absolute bottom-2.5 left-2.5 z-20 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-[10px] font-medium text-slate-200 pointer-events-none">
              {effectiveMode === 'blur'
                ? 'Blurred Edge-to-Edge'
                : `Smart Crop (${item.cropAlignment ?? 'center'})`}
            </div>
          </div>
        </div>

        {/* Video Timeline Seek Bar (shown for videos) */}
        {item.kind === 'video' && (
          <div className="w-full max-w-2xl mt-3 px-3 py-2 rounded-xl bg-surface-900/90 border border-surface-800 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            <span className="text-[11px] font-mono text-slate-300 w-10 text-right shrink-0">
              {formatDuration(currentTime)}
            </span>

            <input
              type="range"
              min={0}
              max={maxSeek}
              step={0.05}
              value={Math.min(currentTime, maxSeek)}
              onChange={handleSeek}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
            />

            <span className="text-[11px] font-mono text-slate-400 w-10 shrink-0">
              {formatDuration(maxSeek)}
            </span>

            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-300 hover:text-white shrink-0"
              title={isMuted ? 'Unmute preview' : 'Mute preview'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-slate-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-200" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Single Media Inspector / Adjustment Bar */}
      <div className="shrink-0 border-t border-surface-800 bg-surface-900/75 px-5 py-3 space-y-2.5">
        {/* Info Row with full-title hover */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                item.kind === 'image'
                  ? 'bg-purple-600/90 text-white'
                  : 'bg-blue-600/90 text-white'
              }`}
            >
              {item.kind === 'image' ? 'IMAGE' : 'VIDEO'}
            </span>
            <div className="relative group min-w-0">
              <span
                className="block text-xs font-semibold text-slate-100 truncate cursor-default"
                title={item.fileName}
              >
                {item.fileName}
              </span>
              <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 bottom-full mb-1.5 z-50 max-w-md px-2.5 py-1.5 rounded-lg bg-surface-950 border border-surface-700 shadow-xl text-xs text-slate-100 break-all whitespace-normal">
                {item.fileName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
            <span className="font-mono text-slate-300">
              {item.width}×{item.height}
            </span>
            <span>({formatAspectLabel(item.width, item.height)})</span>
            <span>•</span>
            <span>{item.ext}</span>
            {item.kind === 'video' && (
              <>
                <span>•</span>
                <span>{item.fps} fps</span>
                <span title={item.hasAudio ? 'Audio present' : 'No audio (silent track auto-added)'}>
                  {item.hasAudio ? (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-slate-500 inline" />
                  )}
                </span>
              </>
            )}
            <span>•</span>
            <span>{formatFileSize(item.fileSize)}</span>
            <span>•</span>
            <span className="font-mono text-slate-200">{formatDuration(effectiveDuration)}</span>
          </div>
        </div>

        {/* Per-Clip Adjustment Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Set as Main Video button */}
            {item.kind === 'video' && (
              <button
                type="button"
                disabled={isRendering || isMainVideo}
                onClick={() => onSetMainVideo(item.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isMainVideo
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 cursor-default'
                    : 'bg-surface-950 hover:bg-amber-500/15 border-surface-700 hover:border-amber-500/40 text-slate-300 hover:text-amber-200'
                }`}
                title="Main video sets output aspect ratio and output filename"
              >
                <Crown className="w-3.5 h-3.5" />
                {isMainVideo ? 'Main Video' : 'Set as Main Video'}
              </button>
            )}

            {item.kind === 'image' && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 bg-surface-950 border border-surface-700 rounded-lg px-2.5 py-1">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Duration</span>
                <input
                  type="number"
                  min={0.5}
                  max={60}
                  step={0.5}
                  disabled={isRendering}
                  value={item.customDuration ?? settings.defaultImageDuration}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val) && val >= 0.5) {
                      onUpdateItem(item.id, { customDuration: val });
                    }
                  }}
                  className="w-12 bg-surface-900 border border-surface-700 rounded px-1.5 py-0.5 text-slate-100 font-mono text-right focus:outline-none focus:border-blue-500"
                />
                <span className="text-slate-500">s</span>
              </label>
            )}

            {/* 2-Button Edge-to-Edge Toggle for this clip */}
            <div className="inline-flex rounded-lg bg-surface-950 border border-surface-700 p-0.5">
              <button
                type="button"
                disabled={isRendering}
                onClick={() => onUpdateItem(item.id, { edgeModeOverride: 'blur' })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  effectiveMode === 'blur'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Blurred Edge-to-Edge Fill for this clip"
              >
                <Layers className="w-3.5 h-3.5" />
                Blur Fill
              </button>
              <button
                type="button"
                disabled={isRendering}
                onClick={() => onUpdateItem(item.id, { edgeModeOverride: 'crop' })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  effectiveMode === 'crop'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Smart Fill & Crop for this clip"
              >
                <Crop className="w-3.5 h-3.5" />
                Smart Crop
              </button>
            </div>

            {effectiveMode === 'crop' && (
              <select
                disabled={isRendering}
                value={item.cropAlignment ?? 'center'}
                onChange={(e) =>
                  onUpdateItem(item.id, {
                    cropAlignment: e.target.value as CropAlignment,
                  })
                }
                className="rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                title="Crop alignment"
              >
                <option value="center">Crop: Center</option>
                <option value="top">Crop: Top</option>
                <option value="bottom">Crop: Bottom</option>
                <option value="left">Crop: Left</option>
                <option value="right">Crop: Right</option>
              </select>
            )}
          </div>

          {/* Quick Reorder / Delete */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isRendering || itemIndex <= 0}
              onClick={() => onMoveItem(itemIndex, itemIndex - 1)}
              className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-700 text-slate-300 disabled:opacity-30"
              title="Move earlier in timeline"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isRendering || itemIndex >= totalItems - 1}
              onClick={() => onMoveItem(itemIndex, itemIndex + 1)}
              className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-700 text-slate-300 disabled:opacity-30"
              title="Move later in timeline"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isRendering}
              onClick={() => onRemoveItem(item.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-red-500/20 border border-surface-700 hover:border-red-500/30 text-xs text-slate-300 hover:text-red-300 disabled:opacity-30"
              title="Remove from queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
