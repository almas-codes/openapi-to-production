#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { checkCommand } from './commands/check.js';
import { mockCommand } from './commands/mock.js';
import { lintCommand } from './commands/lint.js';
import { diffCommand } from './commands/diff.js';

const program = new Command();

program
  .name('o2p')
  .description('openapi-to-production: Turn one openapi.yaml into a production-grade regenerable full-stack')
  .version('0.1.0');

program
  .command('init')
  .description('Interactive setup to create o2p.config.ts')
  .action(initCommand);

program
  .command('generate')
  .description('Run configured generators from OpenAPI specification')
  .option('-c, --config <path>', 'Path to o2p.config.ts')
  .option('-f, --force', 'Force overwrite user-modified files without conflict prompts')
  .option('--dry-run', 'Simulate generation without writing to disk')
  .option('-w, --watch', 'Watch spec file and regenerate on changes')
  .action(generateCommand);

program
  .command('check')
  .description('Check for spec ↔ code drift (exit 1 if code has drifted)')
  .option('-c, --config <path>', 'Path to o2p.config.ts')
  .action(checkCommand);

program
  .command('mock')
  .description('Start realistic OpenAPI mock server with validation')
  .option('-s, --spec <path>', 'Path to openapi.yaml', './openapi.yaml')
  .option('-p, --port <port>', 'Port number to listen on', (v) => parseInt(v, 10), 4010)
  .option('-d, --delay <ms>', 'Simulated response delay in milliseconds', (v) => parseInt(v, 10), 0)
  .action(mockCommand);

program
  .command('lint')
  .description('Lint OpenAPI specification quality rules')
  .argument('[spec]', 'Path to OpenAPI spec', './openapi.yaml')
  .action(lintCommand);

program
  .command('diff')
  .description('Detect breaking and non-breaking changes between two specs')
  .argument('<oldSpec>', 'Path to base OpenAPI spec')
  .argument('<newSpec>', 'Path to modified OpenAPI spec')
  .action(diffCommand);

program.parse(process.argv);
