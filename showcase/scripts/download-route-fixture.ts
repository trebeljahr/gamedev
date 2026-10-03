// Real route handlers under the production drain shim; only the HTTP adapter is a fixture.
import http from 'node:http';
import { GET as modelDownload } from '../src/app/api/models/download/route';
import { GET as packDownload } from '../src/app/api/packs/[vendor]/[pack]/zip/route';
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url ?? '/', `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`);
    const request = new Request(url, { headers: incoming.headers as HeadersInit });
    const match = url.pathname.match(/^\/api\/packs\/([^/]+)\/([^/]+)\/zip$/);
    const response = url.pathname === '/api/models/download' ? await modelDownload(request) : match ? await packDownload(request, { params: Promise.resolve({ vendor: decodeURIComponent(match[1]), pack: decodeURIComponent(match[2]) }) }) : new Response('ready');
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('fixture failure'); }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: (server.address() as import('node:net').AddressInfo).port })));
