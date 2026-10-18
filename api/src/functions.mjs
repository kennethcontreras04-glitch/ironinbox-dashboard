import { app } from '@azure/functions';
import { createStorage } from './storage.mjs';
import { createHandler } from './handler.mjs';

let handler;
app.http('ironinbox', {
  route: '{*path}', methods: ['GET', 'POST'], authLevel: 'anonymous',
  handler: async (request, context) => {
    handler ??= createHandler({
      env: process.env,
      storage: process.env.IRONINBOX_STORAGE_CONNECTION_STRING
        ? createStorage(process.env.IRONINBOX_STORAGE_CONNECTION_STRING, process.env.IRONINBOX_STORAGE_CONTAINER)
        : null,
    });
    return handler(request, context);
  },
});
