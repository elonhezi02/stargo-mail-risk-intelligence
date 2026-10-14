import { simpleParser, type AddressObject } from 'mailparser';
import { convert } from 'html-to-text';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  NormalizedEmail,
  type NormalizedEmail as EmailInput,
} from '../../shared/contracts.js';
import { AppError } from '../errors.js';

function utf8(buffer: Buffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (text.includes('\0')) throw new Error('binary');
    return text;
  } catch {
    throw new AppError(
      'INVALID_TEXT',
      'Please upload a UTF-8 text file. Binary content is not supported.',
    );
  }
}
function fileName(name: string): string {
  return (
    basename(name.replaceAll('\\', '/'))
      .replace(/[\x00-\x1f]/g, '')
      .slice(0, 200) || 'attachment'
  );
}
async function pdfText(buffer: Buffer): Promise<string> {
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
    throw new AppError('INVALID_PDF', 'This file does not contain a valid PDF.');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const result = await parser.getText();
    const text = result.pages
      .map((p) => p.text)
      .join('\n\n')
      .trim();
    if (!text)
      throw new AppError(
        'NO_PDF_TEXT',
        'This PDF has no readable text. Scanned PDFs need OCR, which is not supported in this version.',
      );
    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'INVALID_PDF',
      'This PDF could not be read. It may be damaged or password protected.',
    );
  } finally {
    await parser.destroy();
  }
}
function finish(input: EmailInput): EmailInput {
  const textSize =
    Object.values(input)
      .filter((v) => typeof v === 'string')
      .join('').length +
    input.recipients.join('').length +
    input.attachments.reduce((n, a) => n + a.text.length, 0);
  if (textSize > MAX_TEXT_CHARS)
    throw new AppError(
      'TEXT_TOO_LONG',
      `Readable content exceeds ${MAX_TEXT_CHARS.toLocaleString()} characters. Split it into smaller items; no content was silently truncated.`,
      413,
    );
  if (!input.body.trim() && !input.attachments.some((a) => a.text.trim()))
    throw new AppError('EMPTY_INPUT', 'No readable message or attachment text was found.');
  return NormalizedEmail.parse(input);
}
const empty = (source: EmailInput['source']): EmailInput => ({
  sender: null,
  recipients: [],
  date: null,
  subject: null,
  body: '',
  attachments: [],
  warnings: [],
  source,
});
const addresses = (value: AddressObject | AddressObject[] | undefined) =>
  value
    ? (Array.isArray(value) ? value : [value]).flatMap((v) =>
        v.value.map((a) => a.address).filter((v): v is string => !!v),
      )
    : [];

async function eml(buffer: Buffer, source: EmailInput['source']): Promise<EmailInput> {
  const parsed = await simpleParser(buffer, {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
  });
  if (parsed.attachments.length > MAX_ATTACHMENTS)
    throw new AppError(
      'TOO_MANY_ATTACHMENTS',
      `At most ${MAX_ATTACHMENTS} attachments are supported.`,
    );
  const input = empty(source);
  input.sender = addresses(parsed.from)[0] ?? null;
  input.recipients = [...addresses(parsed.to), ...addresses(parsed.cc)];
  input.date =
    parsed.date && Number.isFinite(parsed.date.getTime()) ? parsed.date.toISOString() : null;
  input.subject = parsed.subject ?? null;
  input.body =
    parsed.text ||
    (parsed.html
      ? convert(parsed.html, {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: false } },
            { selector: 'img', format: 'skip' },
          ],
        })
      : '');
  const names = new Set(['body', 'headers']);
  for (const [i, attachment] of parsed.attachments.entries()) {
    let name = fileName(attachment.filename || `attachment-${i + 1}`);
    while (names.has(name)) name = `${i + 1}-${name}`;
    names.add(name);
    let text = '',
      warning: string | null = null;
    try {
      if (attachment.size > MAX_FILE_BYTES)
        throw new AppError('FILE_TOO_LARGE', 'Attachment exceeds 5 MB.');
      const extension = extname(name).toLowerCase();
      if (extension === '.txt') text = utf8(attachment.content);
      else if (extension === '.pdf') text = await pdfText(attachment.content);
      else
        throw new AppError(
          'UNSUPPORTED_ATTACHMENT',
          'Unsupported attachment type (only TXT and text PDFs inside EML are read).',
        );
      if (!text.trim())
        throw new AppError('EMPTY_ATTACHMENT', 'Attachment contains no readable text.');
    } catch (error) {
      warning = error instanceof AppError ? error.message : 'Attachment could not be read.';
    }
    input.attachments.push({ filename: name, text, warning });
    if (warning) input.warnings.push(`${name}: ${warning}`);
  }
  return finish(input);
}
export async function ingestText(
  raw: string,
  source: 'paste' | 'txt' = 'paste',
): Promise<EmailInput> {
  if (raw.length > MAX_TEXT_CHARS)
    throw new AppError(
      'TEXT_TOO_LONG',
      `Text exceeds ${MAX_TEXT_CHARS.toLocaleString()} characters.`,
      413,
    );
  // Parse real header blocks, but do not mistake arbitrary body text for MIME headers.
  if (/^(?:From|To|Subject|Date|MIME-Version):[^\n]*\r?\n/im.test(raw) && /\r?\n\r?\n/.test(raw))
    return eml(Buffer.from(raw), source);
  return finish({ ...empty(source), body: raw.trim() });
}
export async function ingestFile(buffer: Buffer, filename: string): Promise<EmailInput> {
  if (buffer.length > MAX_FILE_BYTES)
    throw new AppError('FILE_TOO_LARGE', 'Files must be 5 MB or smaller.', 413);
  switch (extname(filename).toLowerCase()) {
    case '.txt':
      return ingestText(utf8(buffer), 'txt');
    case '.eml':
      return eml(buffer, 'eml');
    case '.pdf':
      return finish({ ...empty('pdf'), subject: fileName(filename), body: await pdfText(buffer) });
    default:
      throw new AppError('UNSUPPORTED_FILE', 'Choose a .txt, .pdf, or .eml file.');
  }
}
const Seed = z.object({
  emails: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.array(z.string()),
      date: z.string(),
      subject: z.string(),
      body: z.string(),
      attachments: z.array(z.object({ filename: z.string(), extracted_text: z.string() })),
    }),
  ),
});
export function normalizeSeed(data: unknown) {
  return Seed.parse(data).emails.map((email) => ({
    id: email.id,
    input: finish({
      sender: email.from,
      recipients: email.to,
      date: email.date,
      subject: email.subject,
      body: email.body,
      attachments: email.attachments.map((a) => ({
        filename: a.filename,
        text: a.extracted_text,
        warning: null,
      })),
      warnings: [],
      source: 'seed',
    }),
  }));
}
