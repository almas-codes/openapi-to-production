import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import { loadSpec, runPipeline, type Logger } from '@o2p/core';

export async function checkCommand(options: { config?: string }) {
  const configPath = path.resolve(process.cwd(), options.config || 'o2p.config.ts');
  console.log(pc.cyan(`\n🔍 Checking for OpenAPI spec <-> code drift...`));

  try {
    const configUrl = pathToFileURL(configPath).href;
    const mod = await import(configUrl);
    const userConfig = mod.default || mod;

    const spec = await loadSpec(userConfig.input);

    const logger: Logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => logger,
    };

    const result = await runPipeline(
      {
        input: userConfig.input,
        generators: userConfig.generators,
        dryRun: true,
        logger,
      },
      spec
    );

    let hasDrift = false;
    const fs = await import('node:fs/promises');

    for (const f of result.files) {
      try {
        const current = await fs.readFile(f.absPath, 'utf8');
        const body = f.content;
        if (!current.includes(body.slice(0, 100))) {
          console.log(pc.red(`✖ Drift detected in: ${f.absPath}`));
          hasDrift = true;
        }
      } catch {
        console.log(pc.red(`✖ Missing generated file: ${f.absPath}`));
        hasDrift = true;
      }
    }

    if (hasDrift) {
      console.error(pc.red('\n✖ Check failed: Generated code has drifted from OpenAPI spec. Run "o2p generate" to sync.'));
      process.exit(1);
    } else {
      console.log(pc.green('\n✔ All generated code is in sync with OpenAPI specification.'));
      process.exit(0);
    }
  } catch (err: any) {
    console.error(pc.red(`✖ Check failed: ${err.message}`));
    process.exit(1);
  }
}
