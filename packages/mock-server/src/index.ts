import Fastify, { type FastifyInstance, type HTTPMethods } from 'fastify';
import { faker } from '@faker-js/faker';
import type { ApiSpec, Schema } from '@o2p/core';

export interface MockServerOptions {
  port?: number;
  delayMs?: number;
  seed?: number;
}

export function fakeFromSchema(schema: Schema, spec: ApiSpec): unknown {
  switch (schema.kind) {
    case 'primitive':
      if (schema.type === 'string') {
        if (schema.format === 'uuid') return faker.string.uuid();
        if (schema.format === 'email') return faker.internet.email();
        if (schema.format === 'date-time') return faker.date.recent().toISOString();
        if (schema.format === 'date') return faker.date.recent().toISOString().split('T')[0];
        return faker.word.sample();
      }
      if (schema.type === 'integer') return faker.number.int({ min: 1, max: 100 });
      if (schema.type === 'number') return faker.number.float({ min: 1, max: 100, fractionDigits: 2 });
      if (schema.type === 'boolean') return faker.datatype.boolean();
      return 'sample';
    case 'enum':
      return faker.helpers.arrayElement(schema.values);
    case 'array':
      return Array.from({ length: 3 }, () => fakeFromSchema(schema.items, spec));
    case 'ref': {
      const target = spec.schemas[schema.name]?.schema;
      return target ? fakeFromSchema(target, spec) : {};
    }
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const prop of schema.properties) {
        obj[prop.name] = fakeFromSchema(prop.schema, spec);
      }
      return obj;
    }
    case 'union':
      return schema.variants.length > 0 ? fakeFromSchema(schema.variants[0], spec) : {};
  }
}

export async function startMock(spec: ApiSpec, opts: MockServerOptions = {}): Promise<FastifyInstance> {
  const { port = 4010, delayMs = 0, seed = 1 } = opts;
  faker.seed(seed);

  const app = Fastify({ logger: true });

  // Specification endpoint
  app.get('/__spec', async () => spec);

  for (const op of spec.operations) {
    const fastifyPath = op.path.replace(/{(\w+)}/g, ':$1');

    app.route({
      method: op.method.toUpperCase() as HTTPMethods,
      url: fastifyPath,
      handler: async (req, reply) => {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // Handle forced mock status from header
        const forcedStatus = req.headers['x-mock-status'] as string | undefined;
        let chosenResponse = op.responses.find((r) => r.status.startsWith('2')) || op.responses[0];
        if (forcedStatus) {
          const match = op.responses.find((r) => r.status === forcedStatus);
          if (match) chosenResponse = match;
        }

        const statusCode = parseInt(chosenResponse.status, 10) || 200;
        if (!chosenResponse.schema) {
          return reply.code(statusCode).send();
        }

        const data = fakeFromSchema(chosenResponse.schema, spec);
        return reply.code(statusCode).send(data);
      },
    });
  }

  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
