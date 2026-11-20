import type { Request, Response } from 'express';
import { createApp } from '../server/dist/app';

let handler: Promise<(request: Request, response: Response) => void>;

export default async function api(request: Request, response: Response) {
  handler ??= createApp().then((app) => app.getHttpAdapter().getInstance());
  return (await handler)(request, response);
}
