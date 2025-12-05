#import "@preview/frame-it:1.2.0": *

#let text-color = black
#let background-color = white
#if sys.inputs.at("theme", default: "light") == "dark" {
  text-color = rgb(240, 246, 252)
  background-color = rgb("#0d1117")
}

#set text(text-color)
#set page(fill: background-color, height: auto, margin: 4mm)

// Define frames
#let (command, example, config, note) = frames(
  command: ("Command", green),
  example: ("Example", gray),
  config: ("Config", blue),
  note: ("Note", orange),
)

#show: frame-style(styles.boxy)

// Frame 1: Download Command
#command[Download][Fetch videos from URLs][
```bash
# Download single video
./video-collage download <url>

# Download multiple videos
./video-collage download <url1> <url2> <url3>

# Download and immediately generate collage
./video-collage download --generate <url>

# Download to custom directory
./video-collage download -o ~/Videos <url>
```
]

#pagebreak()

// Frame 2: Generate Command
#command[Generate][Create video collages][
```bash
# Generate from media folder (default)
./video-collage generate

# Generate from specific files
./video-collage generate video1.mp4 image.jpg -o output.mp4

# Custom grid layout
./video-collage generate --columns 3 --rows 2

# Full options
./video-collage generate -w 1920 -h 1080 -t 120 --fps 30 --gap 8
```
]

#pagebreak()

// Frame 3: Configuration
#config[JSON Config][Advanced setup options][
```json
{
  "output": "wallpaper.mp4",
  "width": 1920,
  "height": 1080,
  "duration": 60,
  "fps": 30,
  "background": "black",
  "layout": {
    "type": "grid",
    "columns": 3,
    "rows": 2,
    "gap": 4
  },
  "media": [
    {"path": "video1.mp4", "type": "video", "loop": true},
    {"path": "image.jpg", "type": "image"}
  ]
}
```

Usage: `./video-collage generate --config config.json`
]

#pagebreak()

// Frame 4: Workflow Example
#example[Workflow][Creating an animated wallpaper][
*Step 1: Download videos*
```bash
./video-collage download \
  https://youtube.com/watch?v=relaxing \
  https://youtube.com/watch?v=nature
```

*Step 2: Generate collage*
```bash
./video-collage generate \
  --columns 2 --rows 2 \
  --duration 300 \
  -o wallpaper.mp4
```

*Step 3: Set as wallpaper (Linux)*
```bash
xwinwrap -fs -fdt -ni -b -nf -- \
  mpv --loop --no-audio wallpaper.mp4
```
]
