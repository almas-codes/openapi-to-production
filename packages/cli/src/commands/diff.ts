import pc from 'picocolors';
import { loadSpec } from '@o2p/core';

export async function diffCommand(oldPath: string, newPath: string) {
  console.log(pc.cyan(`\n⚡ Comparing OpenAPI specs:\n  Old: ${oldPath}\n  New: ${newPath}\n`));

  try {
    const oldSpec = await loadSpec(oldPath);
    const newSpec = await loadSpec(newPath);

    const breaking: string[] = [];
    const nonBreaking: string[] = [];

    const oldOps = new Map(oldSpec.operations.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o]));
    const newOps = new Map(newSpec.operations.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o]));

    // Check removed operations
    for (const [key] of oldOps.entries()) {
      if (!newOps.has(key)) {
        breaking.push(`REMOVED operation: ${key}`);
      }
    }

    // Check added operations
    for (const [key] of newOps.entries()) {
      if (!oldOps.has(key)) {
        nonBreaking.push(`ADDED operation: ${key}`);
      }
    }

    // Check parameters on remaining ops
    for (const [key, oldOp] of oldOps.entries()) {
      const newOp = newOps.get(key);
      if (!newOp) continue;

      for (const newP of newOp.parameters) {
        const oldP = oldOp.parameters.find((p) => p.name === newP.name && p.in === newP.in);
        if (!oldP && newP.required) {
          breaking.push(`ADDED REQUIRED parameter: '${newP.name}' in ${key}`);
        }
      }
    }

    if (breaking.length > 0) {
      console.log(pc.red('🚨 BREAKING CHANGES DETECTED:'));
      for (const b of breaking) {
        console.log(pc.red(`  - ${b}`));
      }
    }

    if (nonBreaking.length > 0) {
      console.log(pc.green('\n✨ Non-breaking additions:'));
      for (const nb of nonBreaking) {
        console.log(pc.green(`  - ${nb}`));
      }
    }

    if (breaking.length === 0 && nonBreaking.length === 0) {
      console.log(pc.blue('✔ No functional changes detected between specifications.'));
    }

    if (breaking.length > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(pc.red(`✖ Diff failed: ${err.message}`));
    process.exit(3);
  }
}
