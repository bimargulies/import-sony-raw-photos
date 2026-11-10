# import-sony-raw-photos

- Bump `version` in `package.json` with every change to the program (patch for fixes, minor for
  features). It is the single source of truth: the CLI (`--version`), the watch log, and the Bridge
  watcher popup all read it. Commit the bump with the change.
- After changes, `pnpm install-bridge` rebuilds `dist/` and reinstalls the Bridge script; a running
  watcher keeps the old code until it is stopped and started again.
