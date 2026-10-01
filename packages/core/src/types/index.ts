import type { z } from 'zod';
import type { ApiSpec } from '../ir/types.js';

export type FileKind = 'generated' | 'scaffold';

export interface GeneratedFile {
  path: string; // relative to output root
  content: string;
  kind: FileKind; // generated = always overwrite | scaffold = write once
}

export interface AbsGeneratedFile extends GeneratedFile {
  absPath: string;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  child(name: string): Logger;
}

export interface GeneratorContext<TOpts> {
  spec: ApiSpec;
  options: TOpts;
  outDir: string;
  logger: Logger;
}

export interface Generator<TOpts = unknown> {
  name: string; // e.g. "dotnet-api"
  dependsOn?: string[]; // e.g. react-hooks -> ["ts-client"]
  optionsSchema: z.ZodType<TOpts>;
  generate(ctx: GeneratorContext<TOpts>): Promise<GeneratedFile[]>;
}

export const defineGenerator = <T>(g: Generator<T>): Generator<T> => g;

export type WriteStatus =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'skipped-scaffold'
  | 'overwritten'
  | 'conflict';

export interface WriteOutcome {
  status: WriteStatus;
  path: string;
  reason?: 'user-modified' | 'no-header';
}

export interface PipelineResult {
  files: AbsGeneratedFile[];
  conflicts: WriteOutcome[];
  skipped: WriteOutcome[];
  written?: WriteOutcome[];
}
