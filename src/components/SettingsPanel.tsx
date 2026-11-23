import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  Save,
  Sliders,
  Sparkles,
  Type,
  Unlock,
  Zap,
} from 'lucide-react';
import type {
  EdgeToEdgeMode,
  HardwareInfo,
  OutputFormat,
  ProjectSettings,
  QualityPreset,
  ResolutionMode,
  TargetFpsMode,
  VideoCodec,
  WatermarkFrequency,
  WatermarkSettings,
  WatermarkSize,
} from '../../shared/types';

interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null; // null = free / unlocked
  defaultWidth: number;
  defaultHeight: number;
  iconW: number;
  iconH: number;
}

const ASPECT_PRESETS: AspectPreset[] = [
  { id: '16:9', label: '16:9', ratio: 16 / 9, defaultWidth: 1920, defaultHeight: 1080, iconW: 22, iconH: 13 },
  { id: '9:16', label: '9:16', ratio: 9 / 16, defaultWidth: 1080, defaultHeight: 1920, iconW: 12, iconH: 20 },
  { id: '1:1', label: '1:1', ratio: 1, defaultWidth: 1080, defaultHeight: 1080, iconW: 16, iconH: 16 },
  { id: '4:5', label: '4:5', ratio: 4 / 5, defaultWidth: 1080, defaultHeight: 1350, iconW: 14, iconH: 18 },
  { id: '4:3', label: '4:3', ratio: 4 / 3, defaultWidth: 1440, defaultHeight: 1080, iconW: 19, iconH: 14 },
  { id: '21:9', label: '21:9', ratio: 21 / 9, defaultWidth: 2560, defaultHeight: 1080, iconW: 24, iconH: 10 },
  { id: 'free', label: 'Custom', ratio: null, defaultWidth: 1920, defaultHeight: 1080, iconW: 18, iconH: 14 },
];

function roundEven(val: number): number {
  const r = Math.max(2, Math.round(val));
  return r % 2 === 0 ? r : r + 1;
}

interface SettingsPanelProps {
  settings: ProjectSettings;
  hardware: HardwareInfo | null;
  isRendering: boolean;
  onChange: (patch: Partial<ProjectSettings>) => void;
  onSaveWatermarkPreset: (wm: WatermarkSettings) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  hardware,
  isRendering,
  onChange,
  onSaveWatermarkPreset,
}) => {
  const [watermarkExpanded, setWatermarkExpanded] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [selectedAspectId, setSelectedAspectId] = useState<string>('16:9');

  const hasNvenc = Boolean(hardware?.nvencH264 || hardware?.nvencHevc);
  const activeAspect =
    ASPECT_PRESETS.find((p) => p.id === selectedAspectId) ?? ASPECT_PRESETS[0];

  const handleSelectAspect = (preset: AspectPreset) => {
    setSelectedAspectId(preset.id);
    if (preset.ratio !== null) {
      onChange({
        customWidth: preset.defaultWidth,
        customHeight: preset.defaultHeight,
      });
    }
  };

  const handleCustomWidthChange = (raw: string) => {
    const val = parseInt(raw, 10);
    if (!Number.isFinite(val) || val <= 0) {
      onChange({ customWidth: 0 });
      return;
    }
    if (activeAspect.ratio !== null) {
      onChange({
        customWidth: val,
        customHeight: roundEven(val / activeAspect.ratio),
      });
    } else {
      onChange({ customWidth: val });
    }
  };

  const handleCustomHeightChange = (raw: string) => {
    const val = parseInt(raw, 10);
    if (!Number.isFinite(val) || val <= 0) {
      onChange({ customHeight: 0 });
      return;
    }
    if (activeAspect.ratio !== null) {
      onChange({
        customHeight: val,
        customWidth: roundEven(val * activeAspect.ratio),
      });
    } else {
      onChange({ customHeight: val });
    }
  };

  const updateWatermark = (patch: Partial<WatermarkSettings>) => {
    onChange({
      watermark: {
        ...settings.watermark,
        ...patch,
      },
    });
  };

  const handleSaveWatermark = () => {
    onSaveWatermarkPreset(settings.watermark);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1800);
  };

  return (
    <aside className="w-[330px] shrink-0 border-l border-surface-800 bg-surface-900/50 flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-surface-800 bg-surface-900/60 shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Output Settings
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Output Resolution Mode */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Output Resolution
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['first-video', 'Main Video'],
                ['best-quality', 'Best Quality'],
                ['custom', 'Custom'],
              ] as Array<[ResolutionMode, string]>
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                disabled={isRendering}
                onClick={() => onChange({ resolutionMode: val })}
                className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                  settings.resolutionMode === val
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                    : 'bg-surface-900 border-surface-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {settings.resolutionMode === 'custom' && (
            <div className="mt-2.5 space-y-3 p-2.5 rounded-xl bg-surface-950/60 border border-surface-800">
              {/* Visual Aspect Ratio Grid */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                  <span>Aspect Ratio</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                    {activeAspect.ratio !== null ? (
                      <>
                        <Lock className="w-2.5 h-2.5 text-blue-400" />
                        Locked ({activeAspect.label})
                      </>
                    ) : (
                      <>
                        <Unlock className="w-2.5 h-2.5 text-amber-400" />
                        Free Size
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {ASPECT_PRESETS.map((preset) => {
                    const isActive = selectedAspectId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={isRendering}
                        onClick={() => handleSelectAspect(preset)}
                        className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border transition-all ${
                          isActive
                            ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                            : 'bg-surface-900/90 border-surface-700/80 text-slate-400 hover:border-surface-600 hover:text-slate-200'
                        }`}
                        title={
                          preset.ratio !== null
                            ? `${preset.label} (${preset.defaultWidth}×${preset.defaultHeight})`
                            : 'Free custom width & height'
                        }
                      >
                        <div className="h-5 flex items-center justify-center">
                          <span
                            style={{ width: `${preset.iconW}px`, height: `${preset.iconH}px` }}
                            className={`rounded-[2px] border-[1.5px] transition-colors ${
                              preset.ratio === null ? 'border-dashed' : 'border-solid'
                            } ${
                              isActive
                                ? 'border-blue-400 bg-blue-500/25'
                                : 'border-slate-500 bg-slate-800/60'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] font-semibold leading-none">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Width & Height inputs with aspect lock indicator */}
              <div className="flex items-end gap-2">
                <label className="flex-1 text-[11px] text-slate-400">
                  Width (px)
                  <input
                    type="number"
                    min={128}
                    max={3840}
                    step={2}
                    disabled={isRendering}
                    value={settings.customWidth || ''}
                    onChange={(e) => handleCustomWidthChange(e.target.value)}
                    onBlur={() => {
                      if (!settings.customWidth || settings.customWidth < 128) {
                        handleCustomWidthChange(String(activeAspect.defaultWidth));
                      }
                    }}
                    className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </label>

                <div
                  className="pb-2 text-slate-500"
                  title={
                    activeAspect.ratio !== null
                      ? `Aspect ratio locked to ${activeAspect.label}`
                      : 'Free width & height'
                  }
                >
                  {activeAspect.ratio !== null ? (
                    <Lock className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </div>

                <label className="flex-1 text-[11px] text-slate-400">
                  Height (px)
                  <input
                    type="number"
                    min={128}
                    max={3840}
                    step={2}
                    disabled={isRendering}
                    value={settings.customHeight || ''}
                    onChange={(e) => handleCustomHeightChange(e.target.value)}
                    onBlur={() => {
                      if (!settings.customHeight || settings.customHeight < 128) {
                        handleCustomHeightChange(String(activeAspect.defaultHeight));
                      }
                    }}
                    className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Edge-to-Edge Mode */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            Edge-to-Edge Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['blur', 'Blurred Fill', 'Full frame + blurred edges'],
                ['crop', 'Smart Crop', 'Zoom & fill edge-to-edge'],
              ] as Array<[EdgeToEdgeMode, string, string]>
            ).map(([val, title, desc]) => (
              <button
                key={val}
                type="button"
                disabled={isRendering}
                onClick={() => onChange({ edgeMode: val })}
                className={`p-2.5 rounded-xl text-left border transition-all ${
                  settings.edgeMode === val
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-surface-900 border-surface-700 text-slate-300 hover:border-surface-600'
                }`}
              >
                <div className="text-xs font-semibold">{title}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>

          {settings.edgeMode === 'blur' && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Background Blur Intensity</span>
                <span className="font-mono text-slate-200">{settings.blurStrength}</span>
              </div>
              <input
                type="range"
                min={10}
                max={50}
                step={2}
                disabled={isRendering}
                value={settings.blurStrength}
                onChange={(e) => onChange({ blurStrength: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
          )}
        </div>

        {/* Default Image Duration */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
            <span className="font-semibold uppercase tracking-wider">Default Image Duration</span>
            <span className="font-mono text-blue-300">{settings.defaultImageDuration}s</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            disabled={isRendering}
            value={settings.defaultImageDuration}
            onChange={(e) => onChange({ defaultImageDuration: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>

        {/* Collapsible TikTok-Style Watermark Section */}
        <div className="rounded-xl border border-surface-800 bg-surface-950/50 overflow-hidden">
          <div className="px-3 py-2.5 flex items-center justify-between bg-surface-900/60">
            <button
              type="button"
              onClick={() => setWatermarkExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white flex-1 text-left"
            >
              {watermarkExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              <Type className="w-3.5 h-3.5 text-purple-400" />
              <span>Watermark</span>
              {settings.watermark.enabled && settings.watermark.text.trim() && (
                <span className="ml-1 px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-medium normal-case truncate max-w-[90px]">
                  {settings.watermark.text}
                </span>
              )}
            </button>

            {/* Quick Enable/Disable Toggle */}
            <button
              type="button"
              disabled={isRendering}
              onClick={() => {
                const nextEnabled = !settings.watermark.enabled;
                updateWatermark({ enabled: nextEnabled });
                if (nextEnabled && !settings.watermark.text.trim()) {
                  setWatermarkExpanded(true);
                }
              }}
              title={settings.watermark.enabled ? 'Disable Watermark' : 'Enable Watermark'}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 disabled:opacity-40 ${
                settings.watermark.enabled ? 'bg-purple-500' : 'bg-surface-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.watermark.enabled ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {watermarkExpanded && (
            <div className="p-3 space-y-3 border-t border-surface-800">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                TikTok-style floating text watermark that appears for 1–3s across different corners of the screen.
              </p>

              <label className="block text-[11px] text-slate-400">
                Watermark Text
                <input
                  type="text"
                  disabled={isRendering}
                  placeholder="@YourChannel"
                  value={settings.watermark.text}
                  onChange={(e) => updateWatermark({ text: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">
                  Text Size
                  <select
                    disabled={isRendering}
                    value={settings.watermark.size}
                    onChange={(e) => updateWatermark({ size: e.target.value as WatermarkSize })}
                    className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </label>

                <label className="text-[11px] text-slate-400">
                  Frequency
                  <select
                    disabled={isRendering}
                    value={settings.watermark.frequency}
                    onChange={(e) =>
                      updateWatermark({ frequency: e.target.value as WatermarkFrequency })
                    }
                    className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="frequent">Frequent</option>
                    <option value="normal">Normal (TikTok)</option>
                    <option value="subtle">Subtle</option>
                  </select>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Show Duration</span>
                  <span className="font-mono text-slate-200">
                    {settings.watermark.displayDuration.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.5}
                  disabled={isRendering}
                  value={settings.watermark.displayDuration}
                  onChange={(e) =>
                    updateWatermark({ displayDuration: Number(e.target.value) })
                  }
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Opacity</span>
                  <span className="font-mono text-slate-200">
                    {Math.round(settings.watermark.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={1}
                  step={0.05}
                  disabled={isRendering}
                  value={settings.watermark.opacity}
                  onChange={(e) => updateWatermark({ opacity: Number(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <button
                type="button"
                disabled={isRendering}
                onClick={handleSaveWatermark}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/40 text-purple-200 text-xs font-semibold transition-colors"
              >
                {savedFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Saved for Future Videos!
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Watermark Preset
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Hardware & Encoding */}
        <div className="pt-3 border-t border-surface-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>NVIDIA GPU (NVENC)</span>
            </div>
            <button
              type="button"
              disabled={isRendering || !hasNvenc}
              onClick={() => onChange({ useGpu: !settings.useGpu })}
              className={`w-10 h-5 rounded-full transition-colors relative disabled:opacity-40 ${
                settings.useGpu && hasNvenc ? 'bg-emerald-500' : 'bg-surface-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.useGpu && hasNvenc ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">
              Video Codec
              <select
                disabled={isRendering}
                value={settings.codec}
                onChange={(e) => onChange({ codec: e.target.value as VideoCodec })}
                className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="h264">H.264 (Best Compat.)</option>
                <option value="hevc">H.265 / HEVC (Smaller)</option>
              </select>
            </label>

            <label className="text-[11px] text-slate-400">
              Quality
              <select
                disabled={isRendering}
                value={settings.quality}
                onChange={(e) => onChange({ quality: e.target.value as QualityPreset })}
                className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="high">High (CQ 19)</option>
                <option value="balanced">Balanced (CQ 23)</option>
                <option value="compact">Compact (CQ 27)</option>
              </select>
            </label>

            <label className="text-[11px] text-slate-400">
              Output Format
              <select
                disabled={isRendering}
                value={settings.outputFormat}
                onChange={(e) => onChange({ outputFormat: e.target.value as OutputFormat })}
                className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="mp4">MP4 (.mp4)</option>
                <option value="mkv">MKV (.mkv)</option>
              </select>
            </label>

            <label className="text-[11px] text-slate-400">
              Frame Rate
              <select
                disabled={isRendering}
                value={settings.targetFpsMode}
                onChange={(e) => onChange({ targetFpsMode: e.target.value as TargetFpsMode })}
                className="mt-1 w-full rounded-lg bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="auto">Auto (Match Video)</option>
                <option value="30">30 FPS</option>
                <option value="60">60 FPS</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </aside>
  );
};
