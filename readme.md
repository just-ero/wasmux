# wasmux

wasmux is a browser video editor built with react + ffmpeg wasm.

it lets you trim, crop, and export video/audio locally without uploading files to a server.

## what the app does

- load local media by drop/select
- probe streams and metadata
- edit timeline in/out + crop
- export to common formats (mp4/webm/mkv/mov/gif/mp3/wav)
- keep a live operation log so you can see each step

## how it works

- ffmpeg runs in the browser via wasm
- source files are written to an in-browser filesystem
- commands are generated from editor state
- output is read back and saved with browser download/native save picker

## dev

```sh
pnpm install
pnpm dev
```

## build

```sh
pnpm build
pnpm vitest run
```

## notes

- desktop-first ui
- large files depend on browser memory limits
- export speed depends on cpu/browser

## license

mit
