import type { Generator } from '../types/index.js';

export interface ConfiguredGenerator {
  generator: Generator<unknown>;
  options: unknown;
  outDir: string;
}

export function topoSort(configured: ConfiguredGenerator[]): ConfiguredGenerator[] {
  const map = new Map<string, ConfiguredGenerator>();
  for (const c of configured) {
    map.set(c.generator.name, c);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: ConfiguredGenerator[] = [];

  function visit(name: string) {
    if (visiting.has(name)) {
      throw new Error(`Circular generator dependency detected involving '${name}'`);
    }
    if (visited.has(name)) return;

    visiting.add(name);
    const item = map.get(name);
    if (!item) {
      throw new Error(`Missing generator dependency: '${name}' is required but not configured.`);
    }

    if (item.generator.dependsOn) {
      for (const dep of item.generator.dependsOn) {
        visit(dep);
      }
    }

    visiting.delete(name);
    visited.add(name);
    sorted.push(item);
  }

  for (const c of configured) {
    visit(c.generator.name);
  }

  return sorted;
}

export function toLayers(sorted: ConfiguredGenerator[]): ConfiguredGenerator[][] {
  const depthMap = new Map<string, number>();

  for (const item of sorted) {
    let maxDepDepth = -1;
    if (item.generator.dependsOn) {
      for (const dep of item.generator.dependsOn) {
        const depDepth = depthMap.get(dep) ?? 0;
        if (depDepth > maxDepDepth) {
          maxDepDepth = depDepth;
        }
      }
    }
    depthMap.set(item.generator.name, maxDepDepth + 1);
  }

  const layers: ConfiguredGenerator[][] = [];
  for (const item of sorted) {
    const depth = depthMap.get(item.generator.name) ?? 0;
    if (!layers[depth]) {
      layers[depth] = [];
    }
    layers[depth].push(item);
  }

  return layers;
}
