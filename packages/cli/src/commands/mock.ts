import pc from 'picocolors';
import { loadSpec } from '@o2p/core';
import { startMock } from '@o2p/mock-server';

export interface MockOptions {
  spec?: string;
  port?: number;
  delay?: number;
}

export async function mockCommand(options: MockOptions) {
  const specPath = options.spec || './openapi.yaml';
  const port = options.port || 4010;
  const delayMs = options.delay || 0;

  console.log(pc.cyan(`\n🚀 Starting OpenAPI mock server...`));
  try {
    const spec = await loadSpec(specPath);
    await startMock(spec, { port, delayMs });
    console.log(pc.green(`✔ Mock server listening at http://localhost:${port}`));
    console.log(pc.blue(`  Inspect raw spec at http://localhost:${port}/__spec`));
    console.log(pc.yellow(`  Tip: set 'x-mock-status' header on requests to simulate 400, 404, or 500 errors.\n`));
  } catch (err: any) {
    console.error(pc.red(`✖ Failed to start mock server: ${err.message}`));
    process.exit(1);
  }
}
