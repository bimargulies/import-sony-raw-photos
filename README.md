# import-sony-raw-photos

CLI to import RAW photos from a Sony camera SD card.

    pnpm install
    pnpm start -- <source> <destination>
    pnpm test

`pnpm start -- --version` prints the version; the Bridge watcher popup and the watch log show it too.
The version lives in `package.json` and is bumped with every change.

Defaults: reads ARWs from `/Volumes/Photos/Bridge/Capture` (override with `--source`),
writes DNGs to `~/Bridge/New/<today>/` (override with `--dest`).

## Focus stacks

Marker photos — black frames (lens cap on), judged from the center of the ARW's embedded preview —
come in open/close pairs. The first marker opens a stack,
the next closes it. Markers are deleted without a DNG; the photos between them, in capture order, go
into `<dest>/<date>/stack-NNN/`, where `NNN` comes from a persistent counter (`stack-counter`, beside
the DNG counter). Photos outside a pair go in the day folder as usual. In watch mode an open stack
continues across scans, but not across restarts of the watcher. Thresholds are in `src/blackframe.ts`.

## Descriptions

A photo's description comes from a **sidecar `.xmp` file** next to the ARW (`CAP-0001.ARW` with
`CAP-0001.xmp`, the convention Bridge and Lightroom use; `CAP-0001.ARW.xmp` also works), read from its
XMP `dc:description`. The ARW itself is never modified, because Sony's raw files can be damaged by
tools that rewrite them. If there is no sidecar, the ARW's own description fields are used (IPTC
`Caption-Abstract`, XMP `dc:description` or EXIF `ImageDescription`).

`dnglab` drops all description fields, so after converting, the importer writes the text into the
DNG's IPTC caption, XMP description and EXIF description with exiftool (logged as
`description for ... from ...`). Photos without a description are left alone. When an ARW is
imported (and not kept) its sidecar is deleted with it.

**The delivering program must put the sidecar in place before the ARW**: the importer only looks
for the sidecar when it picks up the ARW. The capture app does this (sidecar first, then the ARW,
each renamed into place atomically).

## Watch mode

    pnpm start -- --watch

Keeps running and imports files as they arrive (Ctrl-C to stop). Each scan logs new, growing and
ready files with timestamps, so you can see what lands. A file is imported only once its size and
mtime have been unchanged for `--settle` seconds (default 10) and it is older than `--min-age`;
`--interval` (default 5) sets the scan period. A file whose header says more image data is coming than the file holds (a slow or stalled copy) is skipped as `incomplete` and re-checked each scan; if it doesn't change for 10 minutes the watcher warns and gives up on it. Before an original is deleted the DNG is checked to
be readable, with the same capture time and dimensions. Failed files are left in place and retried
only if they change or after 5 minutes. A lock file stops two imports running at once (including the
Bridge menu command while a watcher is running). `--watch` can't be combined with `--dry-run`.

## Adobe Bridge menu command

    pnpm install-bridge

Writes a startup script to `~/Library/Application Support/Adobe/Bridge <year>/Startup Scripts/`.
Restart Bridge; **Tools > Import Sony RAW Photos** runs the importer and opens today's folder.
**Tools > Start Watching Sony RAW Imports** launches `--watch` in the background (log:
`~/Library/Logs/import-sony-raw-photos/watch.log`); **Stop Watching Sony RAW Imports** sends it SIGINT so it
finishes the current import and exits.
Re-run `pnpm install-bridge` if the project or node moves.
