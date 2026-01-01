# Video Collage CLI

A terminal-based utility for downloading videos and creating video collages. Perfect for creating animated wallpapers or visual reminders from your favorite content.

## Demo

![Video Collage Demo](assets/demo.gif)

## Features

- Download videos from YouTube, Twitter, TikTok, and 1000+ sites
- **5 layout algorithms**: dynamic, grid, masonry, treemap, pack
- **Full GPU acceleration** with NVIDIA CUDA (RTX support)
- Parallel media processing and concurrent downloads
- Auto-looping for seamless playback
- Shader effects (vignette, bloom, CRT, etc.)
- Configurable resolution, duration, and layout

## Installation

```bash
# Clone the repository
git clone https://github.com/divital-coder/video-collage-cli.git
cd video-collage-cli

# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install yt-dlp
pip install yt-dlp

# Optional: Install gallery-dl for additional site support
pip install gallery-dl
```

**Requirements:**
- [Bun](https://bun.sh) - JavaScript runtime
- [FFmpeg](https://ffmpeg.org) - Video processing (with CUDA support for GPU acceleration)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Video downloading

## Usage

### Quick Start

```bash
# Download videos
bun run src/index.ts download https://youtube.com/watch?v=xxx

# Generate collage
bun run src/index.ts generate

# Full GPU acceleration (NVIDIA)
bun run src/index.ts generate --gpu-full
```

### Download Command

```bash
bun run src/index.ts download [options] <url1> [url2] ...

Options:
  -o, --output <dir>      Output directory (default: ./media)
  --max-height <pixels>   Maximum video height (default: 1080)
  --concurrency <n>       Parallel downloads (default: 3)
  --generate              Generate collage after downloading
```

### Generate Command

```bash
bun run src/index.ts generate [options]

Options:
  -o, --output <path>     Output video (default: collage.mp4)
  -w, --width <pixels>    Output width (default: 1920)
  -h, --height <pixels>   Output height (default: 1080)
  -t, --duration <secs>   Duration in seconds (default: 60)
  --layout <type>         Layout algorithm (see below)
  --gap <pixels>          Gap between cells (default: 0)
  --shader <name>         Apply shader effect
  --preset <name>         Encoding preset
  --gpu                   NVENC encoding only
  --gpu-full              Full CUDA pipeline
```

### List Command

```bash
bun run src/index.ts list
```

## Architecture

### Project Structure

```
video-collage-cli/
├── src/
│   ├── index.ts        CLI entry point and command routing
│   ├── ffmpeg.ts       Video processing and FFmpeg integration
│   ├── layout.ts       Layout algorithms (5 modes)
│   ├── downloader.ts   Media downloading with concurrency
│   ├── config.ts       Configuration loading
│   └── types.ts        TypeScript type definitions
├── shaders/            GLSL shader effects
├── media/              Downloaded media storage
└── README.md
```

### Layout Engine

The layout engine (`src/layout.ts`) provides 5 algorithms for positioning media:

| Layout | Description | Best For |
|--------|-------------|----------|
| `dynamic` | Row-based packing preserving aspect ratios | Mixed aspect ratios (default) |
| `grid` | Uniform cells in rows/columns | Consistent sizing |
| `masonry` | Pinterest-style vertical columns | Variable heights |
| `treemap` | Space-filling squarified algorithm | Maximum canvas usage |
| `pack` | Bin-packing with shelf algorithm | Mixed sizes |

```
┌─────────────────────────────────────────────────────────┐
│  DYNAMIC LAYOUT                                         │
│  ┌──────────────┐┌──────────────┐┌──────────────┐      │
│  │   16:9       ││    16:9      ││    16:9      │      │
│  └──────────────┘└──────────────┘└──────────────┘      │
│  ┌────────────────────┐┌────────────────────┐          │
│  │       4:3          ││        4:3         │          │
│  └────────────────────┘└────────────────────┘          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  TREEMAP LAYOUT                                         │
│  ┌─────────────────────────┐┌──────────────────┐       │
│  │                         ││                  │       │
│  │         Large           ││     Medium       │       │
│  │                         │├────────┬─────────┤       │
│  ├─────────────────────────┤│  Small │  Small  │       │
│  │         Medium          ││        │         │       │
│  └─────────────────────────┘└────────┴─────────┘       │
└─────────────────────────────────────────────────────────┘
```

### GPU Pipeline

The tool supports three processing modes:

```
CPU Mode (default):
  Input → [CPU decode] → [CPU scale] → [CPU overlay] → [CPU encode] → Output

GPU Encoding (--gpu):
  Input → [CPU decode] → [CPU scale] → [CPU overlay] → [NVENC encode] → Output

Full CUDA (--gpu-full):
  Input → [CPU decode] → [hwupload_cuda] → [scale_cuda] → [overlay_cuda] → [NVENC] → Output
                              └── All processing on GPU ──┘
```

**Filter Chain (Full CUDA):**
```
Background:  color=black:1920x1080 → format=nv12 → hwupload_cuda → [bg_cuda]

Videos:      [input] → loop → trim → setpts → format=nv12 → hwupload_cuda → scale_cuda → [v_cuda]

Composite:   [bg_cuda][v0_cuda]overlay_cuda → [v1_cuda]overlay_cuda → ... → [out_cuda]

Encode:      [out_cuda] → h264_nvenc → output.mp4
```

### Performance Features

1. **Parallel FFprobe**: Media info fetched for 8 files concurrently
2. **Concurrent Downloads**: Configurable parallelism (default: 3)
3. **Batch Processing**: Large collections split into batches of 6
4. **NVENC Presets**: p1 (fastest) to p7 (best quality)
5. **Multi-threaded CPU**: Auto-detects optimal thread count

### Encoding Presets

| Preset | CPU (x264) | GPU (NVENC) | Use Case |
|--------|------------|-------------|----------|
| `ultrafast` | ultrafast, CRF 28 | p1, CQ 30 | Quick previews |
| `fast` | veryfast, CRF 26 | p2, CQ 26 | Fast encoding |
| `balanced` | medium, CRF 23 | p4, CQ 23 | Default |
| `quality` | slow, CRF 20 | p6, CQ 20 | High quality |
| `best` | veryslow, CRF 18 | p7, CQ 18 | Maximum quality |

### Shader Effects

Applied as FFmpeg filter chains after compositing:

| Shader | Description |
|--------|-------------|
| `vignette` | Darkens frame edges |
| `bloom` | Glow on bright areas |
| `chromatic` | RGB channel separation |
| `noise` | Film grain texture |
| `crt` | CRT monitor + scanlines |
| `dreamy` | Soft ethereal glow |

## Examples

```bash
# Treemap layout with gap
bun run src/index.ts generate --layout treemap --gap 4

# Masonry with 4 columns
bun run src/index.ts generate --layout masonry --columns 4

# Full GPU with quality preset
bun run src/index.ts generate --gpu-full --preset quality

# CRT shader effect
bun run src/index.ts generate --shader crt

# 4K output with fast encoding
bun run src/index.ts generate -w 3840 -h 2160 --preset fast
```

## Configuration

JSON configuration for complex setups:

```json
{
  "output": "collage.mp4",
  "width": 1920,
  "height": 1080,
  "duration": 60,
  "fps": 30,
  "layout": {
    "type": "dynamic",
    "gap": 4
  },
  "shader": "vignette",
  "gpuFull": true,
  "preset": "balanced",
  "media": [
    { "path": "video1.mp4", "type": "video" },
    { "path": "image1.jpg", "type": "image" }
  ]
}
```

## Supported Formats

**Videos:** mp4, mkv, avi, mov, webm, flv, wmv, m4v

**Images:** jpg, jpeg, png, gif, bmp, webp, tiff

## Supported Platforms

yt-dlp supports 1000+ sites including:
- YouTube
- Twitter/X
- TikTok
- Instagram (requires auth)
- Reddit
- Vimeo
- Twitch
- And many more...

## GPU Requirements

For `--gpu-full`:
- NVIDIA GPU with CUDA support
- FFmpeg compiled with NVENC and CUDA filters
- Tested on RTX 3050 and similar

Check CUDA support:
```bash
ffmpeg -hide_banner -filters | grep cuda
```

## License

MIT

---

**Note:** To regenerate the README frames, run `make readme`. This requires [Typst](https://typst.app).
