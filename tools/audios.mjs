#!/usr/bin/env node
/* ============================================================
   LaProfe Digital · Audios automáticos con la voz de Martina
   ------------------------------------------------------------
   Lee los textos de las lecciones en index.html, ve qué audios faltan
   o cambiaron, los genera con la voz clonada de ElevenLabs, los limpia
   (recorta silencios y deja el volumen en −18 LUFS) y actualiza
   audio/voz.json, que la app lee para saber qué audios hay.

   Reglas:
   - Las grabaciones de Martina (origen "grabado") NO se pisan nunca.
     Si su texto cambió, solo se avisa en el resumen.
   - Los audios hechos con IA (origen "ia") se rehacen si cambió el texto.
   - Tope de caracteres por ejecución (MAX_CARACTERES) para cuidar los créditos.

   Uso:
     node tools/audios.mjs --listar     → solo muestra qué haría (no gasta créditos)
     node tools/audios.mjs              → genera (necesita ELEVENLABS_API_KEY)
   Variables: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (opcional: si no, busca la voz
   "Martina LaProfe"), ELEVENLABS_MODEL (opcional), MAX_CARACTERES (opcional, 20000).
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(RAIZ, 'audio');
const MANIFIESTO = path.join(DIR, 'voz.json');
const PRONUNCIA = path.join(DIR, 'pronunciacion.json');
const LISTAR = process.argv.includes('--listar');
const MAX = +(process.env.MAX_CARACTERES || 20000);
const NOMBRE_VOZ = 'Martina LaProfe';
const AJUSTES = { stability: 0.5, similarity_boost: 0.75, speed: 1.0 }; // los que eligió Martina
const resumen = [];
const say = s => { console.log(s); resumen.push(s); };

/* ---------- 1. Leer las lecciones de index.html ---------- */
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const ini = html.indexOf('const NIVELES = [');
const fin = html.indexOf('NIVELES.forEach(n => n.ls.forEach(l => { if (MOSTRAR_PRACTICA_REAL');
if (ini < 0 || fin < 0) throw new Error('No encontré las lecciones en index.html');
const { NIVELES, REAL } = new Function(html.slice(ini, fin) + '\nreturn {NIVELES, REAL};')();

/* ---------- 2. Qué audios corresponden a cada paso ---------- */
const plano = o => o && typeof o === 'object' && !Array.isArray(o);
const deOS = (x, os) => plano(x) ? (x[os] || x.android) : x;
const conOS = (s, os) => String(s).replace('{os}', os === 'iphone' ? 'iPhone' : 'Android');
function textos(st, os){
  if (st.k === 'ex') return conOS(deOS(st.txt, os), os);
  if (st.k === 'rec') return st.pts.map(p => conOS(deOS(p, os), os)).map(t => /[.!?]$/.test(t) ? t : t + '.').join(' ');
  return null;
}
const esperados = []; // {key, texto, leccion}
for (const nv of NIVELES) for (const l of nv.ls){
  const t = l.steps.findIndex(x => x.k === 'try');
  l.steps.forEach((st, i) => {
    if (st.k !== 'ex' && st.k !== 'rec') return;
    const p = i + 1 + (REAL[l.id] && t >= 0 && i > t ? 1 : 0);
    const a = textos(st, 'android'), b = textos(st, 'iphone'), base = l.id + '-p' + p;
    if (a === b) esperados.push({ key: base, texto: a, leccion: l.t });
    else { esperados.push({ key: base + '-android', texto: a, leccion: l.t }); esperados.push({ key: base + '-iphone', texto: b, leccion: l.t }); }
  });
}

/* ---------- 3. Cómo se lee en voz alta (siglas, números, símbolos) ---------- */
const dic = fs.existsSync(PRONUNCIA) ? JSON.parse(fs.readFileSync(PRONUNCIA, 'utf8')) : {};
const reemplazos = Object.entries(dic.reemplazos || {}).sort((x, y) => y[0].length - x[0].length);
function paraLeer(t){
  let s = t;
  for (const [de, a] of reemplazos) s = s.split(de).join(a);
  return s.replace(/\s*>\s*/g, ', ').replace(/\s+/g, ' ').trim();
}
const huella = t => crypto.createHash('sha1').update(paraLeer(t)).digest('hex').slice(0, 12);

/* ---------- 4. Comparar con lo que ya hay ---------- */
const man = fs.existsSync(MANIFIESTO) ? JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8')) : { archivos: {} };
man.archivos = man.archivos || {};
const existe = k => fs.existsSync(path.join(DIR, k + '.mp3'));
// Primera vez: lo que ya está en la carpeta entra al manifiesto tal como está.
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.mp3'))){
  const k = f.slice(0, -4); if (man.archivos[k]) continue;
  const e = esperados.find(x => x.key === k);
  man.archivos[k] = { origen: /^4[a-d]-/.test(k) ? 'ia' : 'grabado', huella: e ? huella(e.texto) : null, fecha: new Date().toISOString().slice(0, 10) };
}
const faltan = [], cambiaronIA = [], cambiaronGrabados = [];
for (const e of esperados){
  const m = man.archivos[e.key];
  if (!m || !existe(e.key)) { faltan.push(e); continue; }
  if (m.huella && m.huella !== huella(e.texto)) (m.origen === 'ia' ? cambiaronIA : cambiaronGrabados).push(e);
}
const aHacer = faltan.concat(cambiaronIA);
const total = aHacer.reduce((n, e) => n + paraLeer(e.texto).length, 0);
say(`### Audios de LaProfe\n- Audios que corresponden a las lecciones: ${esperados.length}\n- Ya están: ${esperados.length - faltan.length}\n- Faltan: ${faltan.length}\n- Hechos con IA cuyo texto cambió (se rehacen): ${cambiaronIA.length}\n- Caracteres a generar: ${total} (tope por vez: ${MAX})`);
if (cambiaronGrabados.length) say(`\n**Grabaciones de Martina cuyo texto cambió** (no se tocan; conviene regrabarlas o borrarlas para que se hagan con IA):\n` + cambiaronGrabados.map(e => `- ${e.key} · ${e.leccion}`).join('\n'));

function guardarManifiesto(){ fs.writeFileSync(MANIFIESTO, JSON.stringify(man, null, 1) + '\n'); }
function terminar(){ if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen.join('\n') + '\n'); }

if (LISTAR || !aHacer.length){
  if (aHacer.length) say('\nPara generar:\n' + aHacer.map(e => `- ${e.key} (${paraLeer(e.texto).length} caracteres)`).join('\n'));
  guardarManifiesto(); terminar(); process.exit(0);
}

/* ---------- 5. Generar con ElevenLabs ---------- */
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY){ say('\n⚠️ Todavía no está cargada la clave de ElevenLabs (secreto ELEVENLABS_API_KEY): no se generó nada.'); guardarManifiesto(); terminar(); process.exit(0); }
const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io/v1'; // la variable es solo para pruebas
async function idDeVoz(){
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const r = await fetch(API + '/voices', { headers: { 'xi-api-key': KEY } });
  if (!r.ok) throw new Error('No pude leer las voces de ElevenLabs: ' + r.status + ' ' + await r.text());
  const v = (await r.json()).voices.find(x => x.name.trim().toLowerCase() === NOMBRE_VOZ.toLowerCase());
  if (!v) throw new Error(`No encontré la voz "${NOMBRE_VOZ}" en ElevenLabs`);
  return v.voice_id;
}
const voz = await idDeVoz();
const modelo = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const tmp = fs.mkdtempSync(path.join(RAIZ, '.tmp-audio-'));
let usados = 0, hechos = 0;
try {
  for (const e of aHacer){
    const texto = paraLeer(e.texto);
    if (usados + texto.length > MAX){ say(`\n⏸️ Llegué al tope de ${MAX} caracteres. Quedan ${aHacer.length - hechos} audios para la próxima vez.`); break; }
    const r = await fetch(`${API}/text-to-speech/${voz}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: texto, model_id: modelo, voice_settings: AJUSTES })
    });
    if (!r.ok){ say(`\n❌ ${e.key}: ElevenLabs respondió ${r.status} ${(await r.text()).slice(0, 300)}`); if (r.status === 401 || r.status === 429 || r.status === 402) break; continue; }
    const crudo = path.join(tmp, e.key + '.mp3');
    fs.writeFileSync(crudo, Buffer.from(await r.arrayBuffer()));
    // Igual que los audios del nivel 4: sin limpieza de ruido (ya salen limpios), se recortan los bordes y se iguala el volumen.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', crudo, '-af',
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.25,areverse,loudnorm=I=-18:TP=-1.5:LRA=11',
      '-ac', '1', '-ar', '44100', '-b:a', '96k', path.join(DIR, e.key + '.mp3')]);
    man.archivos[e.key] = { origen: 'ia', huella: huella(e.texto), fecha: new Date().toISOString().slice(0, 10) };
    usados += texto.length; hechos++; guardarManifiesto();
    console.log('✓', e.key);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
say(`\n✅ Audios nuevos: ${hechos} · Caracteres usados: ${usados}`);
guardarManifiesto(); terminar();
