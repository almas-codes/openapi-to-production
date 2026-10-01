import pc from 'picocolors';
import { loadSpec } from '@o2p/core';

export async function lintCommand(specPath = './openapi.yaml') {
  console.log(pc.cyan(`\n🔍 Linting OpenAPI specification: ${specPath}`));

  try {
    const spec = await loadSpec(specPath);
    const issues: { level: 'warn' | 'error'; message: string }[] = [];

    const seenIds = new Set<string>();

    for (const op of spec.operations) {
      if (!op.id) {
        issues.push({ level: 'error', message: `Missing operationId on ${op.method.toUpperCase()} ${op.path}` });
      } else if (seenIds.has(op.id)) {
        issues.push({ level: 'error', message: `Duplicate operationId '${op.id}' on ${op.method.toUpperCase()} ${op.path}` });
      } else {
        seenIds.add(op.id);
      }

      if (!op.summary) {
        issues.push({ level: 'warn', message: `Missing summary on ${op.method.toUpperCase()} ${op.path}` });
      }

      for (const p of op.parameters) {
        if (!p.description) {
          issues.push({ level: 'warn', message: `Parameter '${p.name}' on ${op.id} lacks description` });
        }
      }
    }

    for (const issue of issues) {
      if (issue.level === 'error') {
        console.log(pc.red(`  ✖ [error] ${issue.message}`));
      } else {
        console.log(pc.yellow(`  ⚠ [warn] ${issue.message}`));
      }
    }

    const errorCount = issues.filter((i) => i.level === 'error').length;
    const warnCount = issues.filter((i) => i.level === 'warn').length;

    if (errorCount > 0) {
      console.log(pc.red(`\n✖ Lint failed with ${errorCount} errors and ${warnCount} warnings.`));
      process.exit(2);
    } else {
      console.log(pc.green(`\n✔ Lint passed with ${warnCount} warnings and 0 errors.`));
    }
  } catch (err: any) {
    console.error(pc.red(`✖ Lint failed: ${err.message}`));
    process.exit(2);
  }
}
