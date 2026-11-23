export type MediaKind = 'video' | 'image';

export type EdgeToEdgeMode = 'blur' | 'crop';

export type CropAlignment = 'center' | 'top' | 'bottom' | 'left' | 'right';

export type ResolutionMode = 'first-video' | 'best-quality' | 'custom';

export type QualityPreset = 'high' | 'balanced' | 'compact';

export type VideoCodec = 'h264' | 'hevc';

export type OutputFormat = 'mp4' | 'mkv';

export type TargetFpsMode = 'auto' | '30' | '60';

export type WatermarkSize = 'small' | 'medium' | 'large';

export type WatermarkFrequency = 'frequent' | 'normal' | 'subtle';

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  size: WatermarkSize;
  opacity: number; // 0.25 - 1.0
  displayDuration: number; // 1.0 - 3.0 seconds per appearance
  frequency: WatermarkFrequency;
}

export interface MediaItem {
  id: string;
  filePath: string;
  fileName: string;
  ext: string;
  kind: MediaKind;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds (for images, default or custom)
  hasAudio: boolean;
  codec: string;
  fileSize: number; // bytes
  thumbnailDataUrl: string;
  customDuration?: number; // image override in seconds
  edgeModeOverride?: EdgeToEdgeMode; // optional per-item override
  cropAlignment?: CropAlignment;
}

export interface ProjectSettings {
  resolutionMode: ResolutionMode;
  customWidth: number;
  customHeight: number;
  edgeMode: EdgeToEdgeMode;
  blurStrength: number; // 10 - 50
  defaultImageDuration: number; // seconds
  useGpu: boolean;
  codec: VideoCodec;
  quality: QualityPreset;
  outputFormat: OutputFormat;
  targetFpsMode: TargetFpsMode;
  masterVideoId?: string | null;
  watermark: WatermarkSettings;
}

export interface ResolvedProfile {
  width: number;
  height: number;
  fps: number;
  aspectRatio: number;
  aspectLabel: string;
  orientation: 'landscape' | 'portrait' | 'square';
  sourceDescription: string;
}

export interface HardwareInfo {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  gpuName: string | null;
  nvencH264: boolean;
  nvencHevc: boolean;
  ready: boolean;
  error?: string;
}

export interface RenderProgress {
  state: 'idle' | 'rendering' | 'done' | 'error' | 'cancelled';
  percent: number;
  currentTimeSec: number;
  totalDurationSec: number;
  fps: number;
  speed: string;
  etaSec: number | null;
  encoderUsed: string;
  stageLabel: string;
  outputPath?: string;
  error?: string;
  logs: string[];
}

export interface StartRenderRequest {
  items: MediaItem[];
  settings: ProjectSettings;
  outputPath: string;
}

export interface MargeXApi {
  getHardwareInfo: () => Promise<HardwareInfo>;
  openMediaDialog: () => Promise<string[]>;
  saveOutputDialog: (defaultName: string, format: OutputFormat) => Promise<string | null>;
  resolveAutoOutputPath: (sourceFilePath: string, format: OutputFormat) => Promise<string>;
  getPlayableVideoUrl: (filePath: string, forceTranscode?: boolean) => Promise<string>;
  probeFiles: (filePaths: string[]) => Promise<{ items: MediaItem[]; errors: string[] }>;
  startRender: (req: StartRenderRequest) => Promise<{ started: boolean; error?: string }>;
  cancelRender: () => Promise<void>;
  revealInFolder: (filePath: string) => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  getPathForFile: (file: File) => string;
  onRenderProgress: (callback: (progress: RenderProgress) => void) => () => void;
}
