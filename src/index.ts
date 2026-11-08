#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
	.name("import-sony-raw-photos")
	.description("Import RAW photos from a Sony camera SD card.")
	.version("0.1.0")
	.argument("<source>", "path to the mounted SD card")
	.argument("<destination>", "directory to import into")
	.action((source: string, destination: string) => {
		console.log(`TODO: import from ${source} to ${destination}`);
	});

program.parse();
