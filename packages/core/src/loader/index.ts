import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import type { ApiSpec } from '../ir/types.js';
import { IrBuilder } from '../ir/builder.js';

export async function loadSpec(specPath: string): Promise<ApiSpec> {
  const absolutePath = path.resolve(process.cwd(), specPath);
  const content = await fs.readFile(absolutePath, 'utf8');

  let parsed: unknown;
  if (specPath.endsWith('.json')) {
    parsed = JSON.parse(content);
  } else {
    parsed = YAML.parse(content);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid OpenAPI specification at ${specPath}`);
  }

  const raw = parsed as Record<string, unknown>;
  if (!raw.openapi && !raw.swagger) {
    throw new Error(`File at ${specPath} is missing an 'openapi' or 'swagger' root field.`);
  }

  const builder = new IrBuilder();
  return builder.build(raw);
}
