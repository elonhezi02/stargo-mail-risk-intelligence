import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { ingestFile, ingestText, normalizeSeed } from '../server/ingestion';
import { MAX_TEXT_CHARS } from '../shared/contracts';

async function pdf(text?: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  if (text) page.drawText(text, { font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}
describe('ingestion boundaries', () => {
  it('loads all ten seed emails including attachment text', () => {
    const seeds = normalizeSeed(JSON.parse(readFileSync('data/mock_mailbox_data.json', 'utf8')));
    expect(seeds).toHaveLength(10);
    expect(seeds.find((s) => s.id === 'E004')?.input.attachments[0].text).toContain('9902');
  });
  it('parses pasted headers and preserves body evidence', async () => {
    const result = await ingestText(
      'From: Jane <jane@example.com>\nTo: finance@example.com\nSubject: Payment\nDate: Tue, 02 Jun 2026 08:14:00 +0000\n\nPlease send $500.',
    );
    expect(result.sender).toBe('jane@example.com');
    expect(result.recipients).toEqual(['finance@example.com']);
    expect(result.body).toContain('$500');
    expect(result.date).toBe('2026-06-02T08:14:00.000Z');
  });
  it('accepts plain text without inventing metadata', async () => {
    const result = await ingestText('Please review this.');
    expect(result.sender).toBeNull();
    expect(result.subject).toBeNull();
  });
  it('rejects blank content and oversized content without truncation', async () => {
    await expect(ingestText(' \n ')).rejects.toMatchObject({ code: 'EMPTY_INPUT' });
    await expect(ingestText('x'.repeat(MAX_TEXT_CHARS + 1))).rejects.toMatchObject({
      code: 'TEXT_TOO_LONG',
    });
  });
  it('rejects binary TXT, unsupported files and oversized files', async () => {
    await expect(ingestFile(Buffer.from([0xff, 0]), 'bad.txt')).rejects.toMatchObject({
      code: 'INVALID_TEXT',
    });
    await expect(ingestFile(Buffer.from('test'), 'bad.exe')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE',
    });
    await expect(ingestFile(Buffer.alloc(5 * 1024 * 1024 + 1), 'big.txt')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });
  it('extracts real PDF text', async () => {
    expect(
      (await ingestFile(await pdf('Invoice 123. Amount: $500.'), 'invoice.pdf')).body,
    ).toContain('Amount: $500.');
  });
  it('rejects scanned/blank and corrupt PDFs clearly', async () => {
    await expect(ingestFile(await pdf(), 'scan.pdf')).rejects.toMatchObject({
      code: 'NO_PDF_TEXT',
    });
    await expect(ingestFile(Buffer.from('not PDF'), 'fake.pdf')).rejects.toMatchObject({
      code: 'INVALID_PDF',
    });
  });
  it('reads TXT attachments and reports unsupported attachments without discarding the body', async () => {
    const raw =
      'From: a@example.com\r\nTo: b@example.com\r\nSubject: Files\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="BOUND"\r\n\r\n--BOUND\r\nContent-Type: text/plain\r\n\r\nReview the attached notes.\r\n--BOUND\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="notes.txt"\r\n\r\nAmount $500.\r\n--BOUND\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="photo.png"\r\n\r\nnot-an-image\r\n--BOUND--';
    const result = await ingestFile(Buffer.from(raw), 'message.eml');
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].text).toContain('$500');
    expect(result.warnings[0]).toContain('photo.png');
    expect(result.body).toContain('Review');
  });
  it('converts HTML to inert text and preserves link destinations', async () => {
    const raw =
      'From: a@example.com\nSubject: HTML\nContent-Type: text/html\n\n<p>Hello</p><script>alert(1)</script><a href="https://example.com/reset">Reset</a><img src="https://example.com/tracker">';
    const result = await ingestFile(Buffer.from(raw), 'html.eml');
    expect(result.body).toContain('Hello');
    expect(result.body).toContain('https://example.com/reset');
    expect(result.body).not.toContain('<script>');
    expect(result.body).not.toContain('tracker');
  });
});
