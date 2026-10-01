import { defineConfig } from '@o2p/core';
import dotnet from '@o2p/gen-dotnet';
import tsClient from '@o2p/gen-ts-client';
import react from '@o2p/gen-react';
import nextjs from '@o2p/gen-nextjs';
import tests from '@o2p/gen-tests';
import postman from '@o2p/gen-postman';
import docs from '@o2p/gen-docs';

export default defineConfig({
  input: './examples/ecommerce/openapi.yaml',
  generators: [
    dotnet({
      out: './generated/backend/Acme.Api',
      namespace: 'Acme.Commerce.Api',
      framework: 'net10.0',
      validation: 'fluent',
      problemDetails: true,
    }),
    tsClient({
      out: './generated/frontend/api',
      zod: true,
      baseUrlEnv: 'VITE_API_URL',
    }),
    react({
      out: './generated/frontend/api/hooks',
      queryLib: 'tanstack-v5',
    }),
    nextjs({
      out: './generated/frontend/api/next',
      actions: true,
    }),
    tests({
      out: './generated/tests',
      target: 'both',
    }),
    postman({
      out: './generated/postman',
      name: 'Acme Commerce API',
    }),
    docs({
      out: './generated/docs',
      title: 'Acme Commerce API Documentation',
    }),
  ],
  lint: {
    requireOperationIds: true,
    requireExamples: 'warn',
    noDuplicateOperationIds: true,
  },
});
