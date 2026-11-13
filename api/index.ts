import type { IncomingMessage, ServerResponse } from 'http';

let appInstance: any = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appInstance) {
    const { buildApp } = await import('../server/src/app.js');
    appInstance = await buildApp();
    await appInstance.ready();
  }
  appInstance.server.emit('request', req, res);
}
