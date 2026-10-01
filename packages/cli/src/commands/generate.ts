import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import { loadSpec, runPipeline, type Logger } from '@o2p/core';

export interface GenerateOptions {
  config?: string;
  force?: boolean;
  dryRun?: boolean;
  watch?: boolean;
}

export async function generateCommand(options: GenerateOptions) {
  const configPath = path.resolve(process.cwd(), options.config || 'o2p.config.ts');
  console.log(pc.cyan(`\n⚡ openapi-to-production (o2p)`));

  const run = async () => {
    try {
      let userConfig: any;
      try {
        const configUrl = pathToFileURL(configPath).href;
        const mod = await import(configUrl);
        userConfig = mod.default || mod;
      } catch (importErr: any) {
        console.log(pc.yellow(`ℹ Warning loading config (${importErr.message}), using fallback configuration.`));
        userConfig = {
          input: './openapi.yaml',
          generators: [],
        };
      }

      const spec = await loadSpec(userConfig.input);
      console.log(
        pc.green(
          `✔ Loaded ${userConfig.input} (${spec.operations.length} operations, ${
            Object.keys(spec.schemas).length
          } schemas)`
        )
      );

      const logger: Logger = {
        info: (msg) => console.log(pc.blue(`  ℹ [info] ${msg}`)),
        warn: (msg) => console.log(pc.yellow(`  ⚠ [warn] ${msg}`)),
        error: (msg) => console.log(pc.red(`  ✖ [error] ${msg}`)),
        debug: () => {},
        child: () => logger,
      };

      const result = await runPipeline(
        {
          input: userConfig.input,
          generators: userConfig.generators,
          force: options.force,
          dryRun: options.dryRun,
          logger,
        },
        spec
      );

      if (result.conflicts.length > 0) {
        for (const c of result.conflicts) {
          console.log(
            pc.yellow(
              `⚠ conflict: ${c.path} was modified by user. Use --force to overwrite.`
            )
          );
        }
      }

      const createdCount = result.written?.filter((w) => w.status === 'created').length ?? 0;
      const updatedCount = result.written?.filter((w) => w.status === 'updated').length ?? 0;
      const unchangedCount = result.skipped?.filter((s) => s.status === 'unchanged').length ?? 0;

      console.log(
        pc.green(
          `✔ Generation complete: ${createdCount} created, ${updatedCount} updated, ${unchangedCount} unchanged, ${result.conflicts.length} conflicts.`
        )
      );
    } catch (err: any) {
      console.error(pc.red(`✖ Generation failed: ${err.message}`));
      if (!options.watch) process.exit(1);
    }
  };

  await run();

  if (options.watch) {
    console.log(pc.cyan('👀 Watching for changes...'));
    const chokidar = await import('chokidar');
    const watcher = chokidar.watch(['./openapi.yaml', './openapi.json', configPath], {
      ignoreInitial: true,
    });
    watcher.on('all', async () => {
      console.log(pc.magenta('\n🔄 Specification or config changed. Regenerating...'));
      await run();
    });
  }
}
