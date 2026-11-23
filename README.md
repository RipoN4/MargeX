# MargeX

MargeX is a free desktop application for Windows, macOS, and Linux that merges multiple videos and images into a single, edge-to-edge video.

It is built for content creators, social media editors, and everyday users who need to combine mixed media files (different formats, sizes, and orientations) without black bars or complicated video editing software.

## Who Can Use MargeX

- Content creators merging intro images with vertical or horizontal clips
- Social media editors combining mixed-resolution videos (such as 720p, 480p, vertical phone clips, and wide clips) into one consistent aspect ratio
- Anyone who wants a fast, offline desktop tool to join images and videos with optional GPU acceleration and a moving text watermark

## Key Features

- **Merge Images and Videos Together:** Supports MP4, MOV, TS, MKV, AVI, WebM, JPG, PNG, WebP, BMP, TIFF, and more. Images are automatically placed at the beginning by default, and you can reorder anything at any time.
- **No Black Bars (Edge-to-Edge Output):**
  - **Blurred Fill (Default):** Keeps the full image or video visible while filling the sides or top and bottom with a smooth blurred background.
  - **Smart Crop:** Zooms and crops cleanly to fill the screen edge-to-edge with adjustable alignment (Center, Top, Bottom, Left, Right).
- **Automatic Resolution and Aspect Ratio Matching:** Match your Main Video, automatically scale to the Best Quality available, or pick a Custom aspect ratio (16:9, 9:16, 1:1, 4:5, 4:3, 21:9, or Free Custom).
- **Built-In Video Preview:** Click any video to play, pause, scrub the timeline, or set it as your Main Video.
- **Moving Text Watermark:** Optional text watermark that appears briefly across different corners of the screen throughout the video, with saved presets for reuse.
- **Fast Hardware Rendering:** Automatically uses your NVIDIA GPU (NVENC) when available, with automatic CPU fallback on any computer.
- **Smart Auto-Save:** Saves your finished video in the same folder as your Main Video with `_X` added to the filename so your original files are never overwritten.

## Download and Install

Go to the [Releases](https://github.com/RipoN4/MargeX/releases) page and download the installer for your device:

- **Windows:** Download `MargeX Setup x.x.x.exe` to install normally, or `MargeX-x.x.x-Portable.exe` to run directly without installing.
- **macOS:** Download the `.dmg` file, open it, and drag MargeX into your Applications folder.
- **Linux:** Download the `.AppImage` file, make it executable (`chmod +x MargeX-*.AppImage`), and double-click to run.

No separate downloads or codecs are required. Everything needed to merge and convert videos is already included.

## How to Use MargeX

1. **Add Your Files:** Drag and drop your videos and images anywhere into the MargeX window, or click **Add Media**.
2. **Review and Adjust:**
   - All files appear in the left list (images are placed first by default). Drag items to change their order.
   - Click any item to preview it in the center. Click on a video to play or pause, and use the timeline bar to seek.
   - Use the bar below the preview to switch **Blur Fill** or **Smart Crop**, adjust an image's duration (default is 2 seconds), or click **Set as Main Video** to choose which video controls the output aspect ratio and filename.
3. **Choose Output Settings (Right Panel):**
   - Select **Main Video**, **Best Quality**, or **Custom** resolution.
   - Adjust **Blurred Fill** intensity or **Default Image Duration** if needed.
   - Optionally open the **Watermark** section to add and save a reusable text watermark, or use the toggle to turn it on and off quickly.
4. **Export:** Click **Merge & Export**. Your merged video will be saved automatically in the same folder as your Main Video (or click **Save As...** to pick a different folder).
