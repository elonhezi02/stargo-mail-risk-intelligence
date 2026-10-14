import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type {
  Assessment,
  EmailRecord,
  EmailSummary,
  Extraction,
  GraphData,
  NormalizedEmail,
  ProcessingError,
  ProcessingStatus,
} from '../../shared/contracts.js';

type Row = {
  id: string;
  input: string;
  status: ProcessingStatus;
  extraction: string | null;
  assessment: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  model: string | null;
  prompt_version: string | null;
};
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY, input TEXT NOT NULL, status TEXT NOT NULL,
        extraction TEXT, assessment TEXT, error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, model TEXT, prompt_version TEXT
      );
      CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mentions (
        email_id TEXT NOT NULL REFERENCES emails(id), entity_id TEXT NOT NULL REFERENCES entities(id),
        local_id TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(email_id, local_id)
      );
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY, email_id TEXT NOT NULL REFERENCES emails(id),
        source_id TEXT NOT NULL REFERENCES entities(id), target_id TEXT NOT NULL REFERENCES entities(id),
        type TEXT NOT NULL, evidence TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS emails_status ON emails(status);
      CREATE INDEX IF NOT EXISTS mentions_entity ON mentions(entity_id);
    `);
  }
  close() {
    this.db.close();
  }
  create(input: NormalizedEmail, id: string = randomUUID()): EmailRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT OR IGNORE INTO emails(id,input,status,created_at,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(id, JSON.stringify(input), 'queued', now, now);
    return this.get(id)!;
  }
  get(id: string): EmailRecord | null {
    const row = this.db.prepare('SELECT * FROM emails WHERE id=?').get(id) as Row | undefined;
    if (!row) return null;
    return {
      id: row.id,
      input: JSON.parse(row.input),
      status: row.status,
      extraction: row.extraction ? JSON.parse(row.extraction) : null,
      assessment: row.assessment ? JSON.parse(row.assessment) : null,
      error: row.error ? JSON.parse(row.error) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      model: row.model,
      promptVersion: row.prompt_version,
    };
  }
  list(): EmailSummary[] {
    const rows = this.db
      .prepare(
        "SELECT id FROM emails ORDER BY COALESCE(json_extract(input,'$.date'),created_at) DESC, id DESC",
      )
      .all() as { id: string }[];
    return rows.map(({ id }) => {
      const e = this.get(id)!;
      return {
        id,
        sender: e.extraction?.sender ?? e.input.sender,
        subject: e.extraction?.subject ?? e.input.subject,
        date: e.extraction?.date ?? e.input.date,
        preview: e.extraction?.summary ?? e.input.body.slice(0, 180),
        status: e.status,
        risk: e.assessment?.level ?? null,
        attachmentCount: e.input.attachments.length,
        partial: e.input.warnings.length > 0,
        tags: e.assessment?.tags ?? [],
      };
    });
  }
  queued(): string[] {
    return (
      this.db
        .prepare("SELECT id FROM emails WHERE status='queued' ORDER BY created_at, id")
        .all() as { id: string }[]
    ).map((r) => r.id);
  }
  recover() {
    this.db
      .prepare(
        "UPDATE emails SET status='queued', error=NULL, updated_at=? WHERE status IN ('extracting','assessing')",
      )
      .run(new Date().toISOString());
  }
  status(id: string, status: ProcessingStatus) {
    this.db
      .prepare('UPDATE emails SET status=?,error=NULL,updated_at=? WHERE id=?')
      .run(status, new Date().toISOString(), id);
  }
  saveExtraction(id: string, value: Extraction, model: string, version: string) {
    this.db
      .prepare('UPDATE emails SET extraction=?,model=?,prompt_version=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(value), model, version, new Date().toISOString(), id);
  }
  fail(id: string, error: ProcessingError) {
    this.db
      .prepare("UPDATE emails SET status='failed', error=?, updated_at=? WHERE id=?")
      .run(JSON.stringify(error), new Date().toISOString(), id);
  }
  complete(id: string, assessment: Assessment) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM relationships WHERE email_id=?').run(id);
      this.db.prepare('DELETE FROM mentions WHERE email_id=?').run(id);
      const local = new Map<string, string>();
      for (const entity of assessment.entities) {
        // Only explicit email addresses are merged globally. Partial accounts and names remain scoped.
        const emailIdentifier =
          entity.identifier && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entity.identifier)
            ? entity.identifier.toLowerCase()
            : null;
        const key = emailIdentifier ? `email:${emailIdentifier}` : `${id}:${entity.id}`;
        const entityId = createHash('sha256').update(key).digest('hex').slice(0, 24);
        local.set(entity.id, entityId);
        this.db
          .prepare('INSERT OR IGNORE INTO entities(id,type,name) VALUES(?,?,?)')
          .run(entityId, entity.type, entity.name);
        this.db
          .prepare('INSERT INTO mentions(email_id,entity_id,local_id,evidence) VALUES(?,?,?,?)')
          .run(id, entityId, entity.id, JSON.stringify(entity.evidence));
      }
      for (const [i, rel] of assessment.relationships.entries()) {
        const source = local.get(rel.sourceId),
          target = local.get(rel.targetId);
        if (!source || !target) throw new Error('Unknown relationship endpoint');
        this.db
          .prepare(
            'INSERT INTO relationships(id,email_id,source_id,target_id,type,evidence) VALUES(?,?,?,?,?,?)',
          )
          .run(`${id}:${i}`, id, source, target, rel.type, JSON.stringify(rel.evidence));
      }
      this.db
        .prepare(
          "UPDATE emails SET assessment=?,status='completed',error=NULL,updated_at=? WHERE id=?",
        )
        .run(JSON.stringify(assessment), new Date().toISOString(), id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  graph(): GraphData {
    const rows = this.db
      .prepare(
        'SELECT e.id,e.type,e.name,m.email_id FROM entities e JOIN mentions m ON m.entity_id=e.id ORDER BY e.name',
      )
      .all() as {
      id: string;
      type: GraphData['nodes'][number]['type'];
      name: string;
      email_id: string;
    }[];
    const nodes = new Map<string, GraphData['nodes'][number]>();
    for (const row of rows) {
      const node = nodes.get(row.id) ?? {
        id: row.id,
        type: row.type,
        name: row.name,
        emailIds: [],
      };
      if (!node.emailIds.includes(row.email_id)) node.emailIds.push(row.email_id);
      nodes.set(row.id, node);
    }
    const edges = this.db.prepare('SELECT * FROM relationships').all() as {
      id: string;
      email_id: string;
      source_id: string;
      target_id: string;
      type: string;
      evidence: string;
    }[];
    return {
      nodes: [...nodes.values()],
      edges: edges.map((e) => ({
        id: e.id,
        emailId: e.email_id,
        source: e.source_id,
        target: e.target_id,
        type: e.type,
        evidence: JSON.parse(e.evidence),
      })),
    };
  }
}
