import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export async function initCommand() {
  p.intro(pc.bgCyan(pc.black(' o2p init ')));

  const specPathResult = await p.text({
    message: 'Input OpenAPI specification path?',
    placeholder: './openapi.yaml',
    defaultValue: './openapi.yaml',
  });

  if (p.isCancel(specPathResult)) {
    p.cancel('Initialization cancelled.');
    process.exit(0);
  }

  const specPath = String(specPathResult);

  const targets = await p.multiselect({
    message: 'Select target generators to configure:',
    options: [
      { value: 'dotnet', label: 'ASP.NET Core API + FluentValidation' },
      { value: 'tsClient', label: 'TypeScript Client + Zod' },
      { value: 'react', label: 'TanStack React Query v5 Hooks' },
      { value: 'nextjs', label: 'Next.js Server Actions' },
      { value: 'tests', label: 'xUnit & Vitest Contract Tests' },
      { value: 'postman', label: 'Postman Collection v2.1' },
      { value: 'docs', label: 'Markdown & Static HTML Documentation' },
    ],
  });

  if (p.isCancel(targets)) {
    p.cancel('Initialization cancelled.');
    process.exit(0);
  }

  const configContent = `import { defineConfig } from '@o2p/core';
import dotnet from '@o2p/gen-dotnet';
import tsClient from '@o2p/gen-ts-client';
import react from '@o2p/gen-react';
import nextjs from '@o2p/gen-nextjs';
import tests from '@o2p/gen-tests';
import postman from '@o2p/gen-postman';
import docs from '@o2p/gen-docs';

export default defineConfig({
  input: '${specPath}',
  generators: [
    dotnet({ out: './backend/src/Api', namespace: 'Acme.Api', framework: 'net10.0' }),
    tsClient({ out: './frontend/src/api', zod: true, baseUrlEnv: 'VITE_API_URL' }),
    react({ out: './frontend/src/api/hooks', queryLib: 'tanstack-v5' }),
    nextjs({ out: './frontend/src/api/next' }),
    tests({ out: './tests/generated', target: 'both' }),
    postman({ out: './postman' }),
    docs({ out: './docs/api' }),
  ],
  lint: {
    requireOperationIds: true,
    requireExamples: 'warn',
  },
});
`;

  await fs.writeFile(path.resolve(process.cwd(), 'o2p.config.ts'), configContent, 'utf8');
  p.outro(pc.green('✔ Successfully created o2p.config.ts! Run "o2p generate" to build your fullstack.'));
}
