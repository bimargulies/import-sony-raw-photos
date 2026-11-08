# import-sony-raw-photos

CLI to import RAW photos from a Sony camera SD card.

    pnpm install
    pnpm start -- <source> <destination>
    pnpm test

Defaults: reads ARWs from `/Volumes/Photos/Bridge/Capture` (override with `--source`),
writes DNGs to `~/Bridge/New/<today>/` (override with `--dest`).

## Adobe Bridge menu command

    pnpm install-bridge

Writes a startup script to `~/Library/Application Support/Adobe/Bridge <year>/Startup Scripts/`.
Restart Bridge; **Tools > Import Sony RAW Photos** runs the importer and opens today's folder.
Re-run `pnpm install-bridge` if the project or node moves.
