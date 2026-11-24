import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyRequest } from 'fastify';
import fs from 'node:fs';
import { ENTITY_INPUTS, type EntityName } from '../shared/schema';
import type { Db } from './db';
import * as repo from './repo';

export interface AppOptions {
  db: Db;
  /** Directory of the built SPA to serve, if any. */
  webDir?: string;
  logger?: boolean;
}

/** Display name of whoever made the change; sent by the client, no authentication. */
const userOf = (req: FastifyRequest) => {
  const raw = req.headers['x-user'];
  return typeof raw === 'string' && raw ? decodeURIComponent(raw) : null;
};

export function buildApp({ db, webDir, logger = false }: AppOptions) {
  const app = Fastify({ logger, bodyLimit: 20 * 1024 * 1024 });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof repo.HttpError) {
      return reply.status(err.status).send({ error: err.message, details: err.details });
    }
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: 'internal error' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/model', async () => repo.loadModel(db));
  app.get('/api/export/json', async (_req, reply) => {
    reply.header('content-disposition', 'attachment; filename="arch-model.json"');
    return repo.loadModel(db);
  });

  const isEntity = (name: string): name is EntityName => Object.hasOwn(ENTITY_INPUTS, name);
  const entityOf = (name: string): EntityName => {
    if (!isEntity(name)) throw new repo.HttpError(404, 'unknown collection');
    return name;
  };

  app.post<{ Params: { entity: string } }>('/api/:entity', async (req, reply) => {
    if (req.params.entity === 'scenarios') return reply.status(201).send(repo.createScenario(db, req.body, userOf(req)));
    return reply.status(201).send(repo.createEntity(db, entityOf(req.params.entity), req.body, userOf(req)));
  });
  app.put<{ Params: { entity: string; id: string } }>('/api/:entity/:id', async (req) => {
    if (req.params.entity === 'scenarios') return repo.updateScenario(db, req.params.id, req.body, userOf(req));
    return repo.updateEntity(db, entityOf(req.params.entity), req.params.id, req.body, userOf(req));
  });
  app.delete<{ Params: { entity: string; id: string } }>('/api/:entity/:id', async (req, reply) => {
    if (req.params.entity === 'scenarios') repo.deleteScenario(db, req.params.id);
    else repo.deleteEntity(db, entityOf(req.params.entity), req.params.id);
    return reply.status(204).send();
  });

  if (webDir && fs.existsSync(webDir)) {
    app.register(fastifyStatic, { root: webDir });
    // SPA fallback
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
