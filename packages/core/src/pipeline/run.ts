import * as path from 'node:path';
import type { ApiSpec } from '../ir/types.js';
import type { AbsGeneratedFile, PipelineResult, Logger } from '../types/index.js';
import { topoSort, toLayers, type ConfiguredGenerator } from './topo-sort.js';
import { writeAll } from '../writer/safe-write.js';

export interface ResolvedConfig {
  input: string;
  generators: ConfiguredGenerator[];
  dryRun?: boolean;
  force?: boolean;
  logger: Logger;
}

export async function runPipeline(cfg: ResolvedConfig, spec: ApiSpec): Promise<PipelineResult> {
  const ordered = topoSort(cfg.generators);
  const allFiles: AbsGeneratedFile[] = [];

  for (const layer of toLayers(ordered)) {
    const batches = await Promise.all(
      layer.map(async (g) => {
        const parsedOptions = g.generator.optionsSchema.parse(g.options);
        const files = await g.generator.generate({
          spec,
          options: parsedOptions,
          outDir: g.outDir,
          logger: cfg.logger.child(g.generator.name),
        });

        return files.map((f) => ({
          ...f,
          absPath: path.resolve(g.outDir, f.path),
        }));
      })
    );
    allFiles.push(...batches.flat());
  }

  // Ensure no two generators write to the exact same path
  assertNoPathCollisions(allFiles);

  if (cfg.dryRun) {
    return {
      files: allFiles,
      conflicts: [],
      skipped: [],
    };
  }

  const { written, conflicts, skipped } = await writeAll(allFiles, { force: cfg.force });
  return {
    files: allFiles,
    conflicts,
    skipped,
    written,
  };
}

function assertNoPathCollisions(files: AbsGeneratedFile[]) {
  const seen = new Set<string>();
  for (const file of files) {
    const normalized = path.normalize(file.absPath).toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`Path collision detected: multiple generators attempted to output '${file.absPath}'`);
    }
    seen.add(normalized);
  }
}
