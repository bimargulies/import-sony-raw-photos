# import-sony-raw-photos

CLI to import RAW photos from a Sony camera SD card.

    pnpm install
    pnpm start -- <source> <destination>
    pnpm test

Defaults: reads ARWs from `/Volumes/Photos/Bridge/Capture` (override with `--source`),
writes DNGs to `~/Bridge/New/<today>/` (override with `--dest`).

## Focus stacks

A marker photo — a gray card (uniform, neutral mid-gray) or a black frame (lens cap on), judged
from the center of the ARW's embedded preview — starts a stack. The marker photo is deleted without a DNG, and the photos
after it, in capture order, go into `<dest>/<date>/stack-NNN/` until the next gray card. `NNN` comes
from a persistent counter (`stack-counter`, beside the DNG counter). Photos before the first gray
card go in the day folder as usual. In watch mode an open stack continues across scans, but not
across restarts of the watcher. Thresholds are in `src/graycard.ts`.

## Watch mode

    pnpm start -- --watch

Keeps running and imports files as they arrive (Ctrl-C to stop). Each scan logs new, growing and
ready files with timestamps, so you can see what lands. A file is imported only once its size and
mtime have been unchanged for `--settle` seconds (default 10) and it is older than `--min-age`;
`--interval` (default 5) sets the scan period. Before an original is deleted the DNG is checked to
be readable, with the same capture time and dimensions. Failed files are left in place and retried
only if they change or after 5 minutes. A lock file stops two imports running at once (including the
Bridge menu command while a watcher is running). `--watch` can't be combined with `--dry-run`.

## Adobe Bridge menu command

    pnpm install-bridge

Writes a startup script to `~/Library/Application Support/Adobe/Bridge <year>/Startup Scripts/`.
Restart Bridge; **Tools > Import Sony RAW Photos** runs the importer and opens today's folder.
**Tools > Start Watching Sony RAW Imports** launches `--watch` in the background (log:
`$TMPDIR/import-sony-raw-photos-watch.log`); **Stop Watching Sony RAW Imports** sends it SIGINT so it
finishes the current import and exits.
Re-run `pnpm install-bridge` if the project or node moves.
