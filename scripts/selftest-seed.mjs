// Siapkan data uji untuk scripts/selftest.js di server LOKAL (DEV_LOGIN=1): akun zztest + pesan berisi
// link, PDF, dokumen, dan foto. Mencetak JSON { conv, a } untuk dipakai selftest.
const BASE = process.env.JEKARDAH_URL || 'http://localhost:3000';
if (!/^http:\/\/localhost/.test(BASE)) throw new Error('Hanya untuk server lokal');
const login = async (email, name) => {
  const r = await fetch(`${BASE}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
};
const a = 'zztest.desk.a@gmail.com';
const cookie = await login('zztest.desk.b@gmail.com', 'Budi Desktop');
const call = async (path, body, form) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { cookie, ...(form ? {} : { 'content-type': 'application/json' }) }, body: form || JSON.stringify(body) });
  return r.json();
};
await login(a, 'Andi Desktop');
const conv = (await call('/api/conversations', { email: a })).conversation.id;
const send = (body) => call(`/api/conversations/${conv}/messages`, { clientId: crypto.randomUUID(), ...body });
const upload = async (name, type, content) => {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  return call('/api/upload', null, fd);
};
const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 46>>stream
BT /F1 24 Tf 30 50 Td (Halo dari PDF) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;
await send({ body: 'Cek link ini https://example.com/halo ya' });
const p = await upload('laporan.pdf', 'application/pdf', pdf);
await send({ type: 'document', fileUrl: p.url, fileName: p.name, fileSize: p.size });
const t = await upload('catatan.txt', 'text/plain', 'Catatan uji desktop\n');
await send({ type: 'document', fileUrl: t.url, fileName: t.name, fileSize: t.size });
const fs = await import('node:fs');
const i = await upload('foto.png', 'image/png', fs.readFileSync(new URL('../build/badge.png', import.meta.url)));
await send({ type: 'image', fileUrl: i.url, body: 'Foto uji' });
await send({ body: 'Pesan terakhir 👋' });
console.log(JSON.stringify({ conv, a }));
