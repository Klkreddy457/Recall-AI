import type { IncomingMessage, ServerResponse } from 'http';
import { buildApp } from '../server/src/app.js';

let appInstance: any = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appInstance) {
    appInstance = await buildApp();
    await appInstance.ready();
  }
  appInstance.server.emit('request', req, res);
}
