import { describe, it, expect } from 'vitest';
import { IrBuilder } from '../src/ir/builder.js';
import { pascal, camel, kebab } from '../src/naming/index.js';

describe('Naming Utilities', () => {
  it('converts strings to pascal case', () => {
    expect(pascal('pet_store_api')).toBe('PetStoreApi');
    expect(pascal('get-pet-by-id')).toBe('GetPetById');
  });

  it('converts strings to camel case and escapes C# keywords', () => {
    expect(camel('first_name')).toBe('firstName');
    expect(camel('class')).toBe('@class');
    expect(camel('event')).toBe('@event');
  });

  it('converts strings to kebab case', () => {
    expect(kebab('PetStoreApi')).toBe('pet-store-api');
  });
});

describe('IR Builder', () => {
  it('normalizes simple schemas into IR', () => {
    const builder = new IrBuilder();
    const spec = builder.build({
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'listUsers',
            tags: ['Users'],
            responses: {
              '200': {
                description: 'OK',
              },
            },
          },
        },
      },
    });

    expect(spec.info.title).toBe('Test API');
    expect(spec.operations.length).toBe(1);
    expect(spec.operations[0].id).toBe('listUsers');
    expect(spec.operations[0].tag).toBe('Users');
  });

  it('hoists inline enums to named schemas', () => {
    const builder = new IrBuilder();
    const spec = builder.build({
      paths: {
        '/orders': {
          post: {
            operationId: 'createOrder',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'string',
                        enum: ['Pending', 'Completed'],
                      },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    });

    expect(spec.schemas['CreateOrderRequestStatus']).toBeDefined();
    expect(spec.schemas['CreateOrderRequestStatus'].schema.kind).toBe('enum');
  });
});
