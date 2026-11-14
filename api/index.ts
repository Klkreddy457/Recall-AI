import type { IncomingMessage, ServerResponse } from 'http';

let appInstance: any = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!appInstance) {
      const { buildApp } = await import('../server/src/app.js');
      appInstance = await buildApp();
      await appInstance.ready();
    }
    appInstance.server.emit('request', req, res);
  } catch (err: any) {
    console.error('Fatal Serverless Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Serverless Handler Initialization Error',
        message: err?.message || String(err),
        stack: err?.stack,
      })
    );
  }
}
