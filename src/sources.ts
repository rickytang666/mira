import { load } from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from 'wasp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function publicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'Enter a complete URL, including https://.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new HttpError(400, 'Use a public HTTP or HTTPS URL.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  const blocked = (address: string) => {
    if (address.includes(':')) return /^(::|fc|fd|fe[89ab])/i.test(address) || address.includes('.');
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  };
  if (!addresses.length || addresses.some(({ address }) => blocked(address)))
    throw new HttpError(400, 'Use a publicly accessible URL. Local network addresses are not supported.');
  return url;
}

export async function importWebsite({ url: input }: { url: string }) {
  try {
    let url = await publicUrl(input);
    for (let redirect = 0; redirect < 5; redirect++) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'MiraResearch/1.0', Accept: 'text/html' },
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        url = await publicUrl(new URL(location, url).href);
        continue;
      }
      if (!response.ok) throw new Error(`The website returned ${response.status}.`);
      if (!response.headers.get('content-type')?.includes('text/html'))
        throw new Error('This URL is not a web page. Use PDF upload for documents.');
      if (!response.body) throw new Error('The website returned an empty page.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_000_000) {
          await reader.cancel();
          throw new Error('This page is too large. Try a specific product page.');
        }
        chunks.push(value);
      }
      const $ = load(Buffer.concat(chunks).toString('utf8'));
      const title = $('meta[property="og:title"]').attr('content') || $('title').text() || url.hostname;
      $('script, style, nav, footer, header, noscript, svg').remove();
      const content =
        ($('meta[name="description"]').attr('content') || '') +
        '\n' +
        ($('main').length ? $('main').text() : $('body').text());
      const cleaned = content.replace(/\s+/g, ' ').trim().slice(0, 50000);
      if (cleaned.length < 40) throw new Error('This page needs a browser to load. Paste a description instead.');
      return { title: title.trim().slice(0, 150), content: cleaned, detail: url.hostname };
    }
    throw new Error('This URL redirects too many times.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, error instanceof Error ? error.message : 'Could not read this website.');
  }
}

export async function importMcp({ endpoint, token }: { endpoint: string; token?: string }) {
  const client = new Client({ name: 'mira', version: '1.0.0' });
  try {
    const url = await publicUrl(endpoint);
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      fetch: async (input, init) => {
        await publicUrl(String(input));
        return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
      },
    });
    await client.connect(transport);
    const { resources } = await client.listResources();
    if (!resources.length)
      throw new Error(
        'This server has no readable resources. Use a server that exposes product documents as MCP resources.',
      );
    const documents: string[] = [];
    for (const resource of resources.slice(0, 5)) {
      const result = await client.readResource({ uri: resource.uri });
      for (const content of result.contents)
        if ('text' in content && typeof content.text === 'string')
          documents.push(`${resource.name}\n${content.text.slice(0, 20000)}`);
    }
    if (!documents.length) throw new Error('No text resources were available on this server.');
    return {
      title: url.hostname,
      content: documents.join('\n\n').slice(0, 80000),
      detail: `${documents.length} resources imported`,
    };
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Could not connect to this MCP server.');
  } finally {
    await client.close().catch(() => {});
  }
}
