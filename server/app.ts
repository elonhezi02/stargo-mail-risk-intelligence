import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_FILE_BYTES, MAX_TEXT_CHARS } from '../shared/contracts.js';
import { AppError } from './errors.js';
import { ingestFile, ingestText } from './ingestion/index.js';
import type { ModelClient } from './agents/ollama.js';
import type { Store } from './storage/store.js';
import type { Pipeline } from './pipeline.js';

export function createApp(
  store: Store,
  pipeline: Pipeline,
  model: ModelClient,
  autoProcess = true,
) {
  const app = express();
  app.disable('x-powered-by');
  // No auth by assignment. Bind to loopback and reject cross-origin browser writes.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    );
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      const allowed = new Set([`http://${req.headers.host}`, 'http://localhost:5173']);
      if (!allowed.has(req.headers.origin))
        return next(new AppError('FORBIDDEN_ORIGIN', 'Cross-origin writes are not allowed.', 403));
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 },
  });
  app.get('/api/health', async (_req, res) => {
    res.json({
      model: model.model,
      ...(await model.health()),
      processing: pipeline.processing,
      queued: store.queued().length,
      autoProcess,
    });
  });
  app.get('/api/emails', (_req, res) => res.json({ emails: store.list() }));
  app.get('/api/graph', (_req, res) => res.json(store.graph()));
  app.get('/api/emails/:id', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) throw new AppError('NOT_FOUND', 'This email was not found.', 404);
    res.json(record);
  });
  app.post('/api/emails', async (req, res) => {
    const { text } = z
      .object({
        text: z.string().trim().min(1, 'Paste some email text first.').max(MAX_TEXT_CHARS),
      })
      .parse(req.body);
    const record = store.create(await ingestText(text));
    if (autoProcess) pipeline.enqueue(record.id);
    res.status(202).json({ id: record.id });
  });
  app.post('/api/uploads', upload.single('file'), async (req, res) => {
    if (!req.file) throw new AppError('MISSING_FILE', 'Choose a file to upload.');
    const record = store.create(await ingestFile(req.file.buffer, req.file.originalname));
    if (autoProcess) pipeline.enqueue(record.id);
    res.status(202).json({ id: record.id });
  });
  app.post('/api/emails/:id/retry', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) throw new AppError('NOT_FOUND', 'This email was not found.', 404);
    if (record.status !== 'failed' && record.status !== 'queued')
      throw new AppError('NOT_RETRYABLE', 'Only failed or waiting items can be started.', 409);
    pipeline.enqueue(record.id);
    res.status(202).json({ id: record.id });
  });
  app.use('/api', (_req, _res, next) =>
    next(new AppError('NOT_FOUND', 'API route not found.', 404)),
  );
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof AppError)
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: error.issues.map((i) => i.message).join('; '),
          },
        });
      if (error instanceof multer.MulterError)
        return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
          error: {
            code: error.code,
            message:
              error.code === 'LIMIT_FILE_SIZE'
                ? 'Files must be 5 MB or smaller.'
                : 'Upload exactly one file, without extra fields.',
          },
        });
      if (error instanceof SyntaxError)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
      if (
        typeof error === 'object' &&
        error &&
        'type' in error &&
        error.type === 'entity.too.large'
      )
        return res.status(413).json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request exceeds the allowed size.' },
        });
      console.error(error);
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      });
    },
  );
  return app;
}
