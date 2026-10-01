const RESERVED_WORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked',
  'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else',
  'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for',
  'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock',
  'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params',
  'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
  'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using',
  'virtual', 'void', 'volatile', 'while', 'record', 'var', 'async', 'await'
]);

export function pascal(str: string): string {
  if (!str) return '';
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^([a-z])/, (m) => m.toUpperCase())
    .replace(/^[0-9]/, (m) => `Item${m}`)
    .replace(/[^a-zA-Z0-9]/g, '');
}

export function camel(str: string): string {
  const p = pascal(str);
  if (!p) return '';
  const result = p.charAt(0).toLowerCase() + p.slice(1);
  return RESERVED_WORDS.has(result) ? `@${result}` : result;
}

export function kebab(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizeIdentifier(str: string, isCSharp = false): string {
  let cleaned = str.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(cleaned)) {
    cleaned = `_${cleaned}`;
  }
  if (isCSharp && RESERVED_WORDS.has(cleaned)) {
    return `@${cleaned}`;
  }
  return cleaned;
}
