/**
 * LaProfe Digital · Pestaña "Piloto" de la planilla "LaProfe – datos"
 *
 * 1. Pegar TODO este código como un archivo nuevo en el Apps Script de la planilla
 *    (al lado de "Archivos", tocar "+" → "Secuencia de comandos" → nombre: piloto).
 * 2. En el archivo donde está "function doPost(e) {", pegar esta línea justo debajo:
 *
 *        pilotoDesdePedido(e);
 *
 * 3. Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar.
 *
 * Crea sola la pestaña "Piloto" la primera vez. Una fila por alumno, con su código anónimo.
 * Si algo de acá falla, no frena el resto: los datos siguen llegando a las otras pestañas.
 */

/** Lee el pedido que manda la app. Solo actúa con los datos de uso (no con las preguntas a Martina IA). */
function pilotoDesdePedido(e) {
  if (!e || !e.postData) {
    console.log('Esta función la usa la app, no hace falta ejecutarla. Para probar, elegí "probarPiloto" arriba y tocá Ejecutar.');
    return;
  }
  try {
    var d = JSON.parse(e.postData.contents);
    if (d && d.uid && d.data && !d.tipo) guardarPiloto(d.uid, d.data);
  } catch (err) {
    console.log('Piloto: ' + err);
  }
}

var PILOTO_PLANILLA = '1VK1dv_3GB8U2s_GaulYZGFspIUzZK4V2p2UzMsgZKbo';
var PILOTO_ZONA = 'America/Montevideo';
var PILOTO_COLUMNAS = [
  'Alumno (id)',
  'De dónde llegó',
  'Primera visita',
  'Última visita',
  'Días distintos que entró',
  'Días que volvió sin recordatorio',
  'Días que entró por un recordatorio',
  'Vio la oferta de recordatorio',
  'Pidió recordatorios',
  'Lecciones empezadas',
  'Lecciones terminadas',
  'Niveles terminados',
  'Repasitos hechos',
  'Aciertos en repasitos (%)',
  'Preguntas que ya recuerda (cajita 2 o más)',
  'Abre desde el ícono',
  'Días en que entró',
  'Actualizado',
  'Aceptó compartir datos'
];

function guardarPiloto(uid, data) {
  if (!uid || !data) return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return; }
  try {
    var ss = SpreadsheetApp.openById(PILOTO_PLANILLA);
    var sh = ss.getSheetByName('Piloto') || ss.insertSheet('Piloto');
    if (sh.getLastRow() === 0 || sh.getLastColumn() < PILOTO_COLUMNAS.length) {
      // Primera vez, o se sumaron columnas nuevas: se escribe la fila de títulos completa
      sh.getRange(1, 1, 1, PILOTO_COLUMNAS.length).setValues([PILOTO_COLUMNAS]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    var fila = pilotoFila_(uid, data);
    var n = sh.getLastRow();
    var ids = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === uid) { sh.getRange(i + 2, 1, 1, fila.length).setValues([fila]); return; }
    }
    sh.appendRow(fila);
  } finally {
    lock.releaseLock();
  }
}

function pilotoFila_(uid, d) {
  var dias = Array.isArray(d.dias) ? d.dias : [];
  var diasRec = Array.isArray(d.diasRec) ? d.diasRec : [];
  var sinRec = dias.filter(function (x) { return diasRec.indexOf(x) < 0; });
  var lec = d.lec || {};
  var empezadas = 0, terminadas = 0;
  Object.keys(lec).forEach(function (k) { if (lec[k].ini) empezadas++; if (lec[k].fin) terminadas++; });
  var niveles = Object.keys(d.niveles || {}).map(function (k) { return k + ' (' + pilotoFecha_(d.niveles[k], 'dd/MM') + ')'; }).join(', ');
  var repasos = Array.isArray(d.repasos) ? d.repasos : [];
  var ok = 0, tot = 0;
  repasos.forEach(function (r) { ok += r.ok || 0; tot += r.tot || 0; });
  var memoria = d.memoria || {};
  var recuerda = Object.keys(memoria).filter(function (k) { return memoria[k] >= 2; }).length;
  return [
    uid,
    d.src || 'directo',
    pilotoFecha_(d.inicio),
    pilotoFecha_(d.ultimo),
    dias.length,
    // El primer día no cuenta como "volver": se descuenta si no fue por un recordatorio
    Math.max(sinRec.length - (sinRec.indexOf(dias[0]) === 0 ? 1 : 0), 0),
    diasRec.length,
    d.recVio ? 'sí' : '',
    d.recPidio ? pilotoFecha_(d.recPidio) : '',
    empezadas,
    terminadas,
    niveles,
    repasos.length,
    tot ? Math.round(ok * 100 / tot) : '',
    recuerda,
    d.abreDesdeIcono || (d.instalada ? 'sí' : ''),
    dias.join(', '),
    pilotoFecha_(new Date().toISOString()),
    d.datosOk || 'sin responder'
  ];
}

function pilotoFecha_(iso, formato) {
  if (!iso) return '';
  try { return Utilities.formatDate(new Date(iso), PILOTO_ZONA, formato || 'dd/MM/yyyy HH:mm'); }
  catch (e) { return iso; }
}

/** Para probar sin la app: Ejecutar → probarPiloto. Crea una fila "prueba-piloto" que después se puede borrar. */
function probarPiloto() {
  guardarPiloto('prueba-piloto', {
    src: 'pauta', inicio: new Date().toISOString(), ultimo: new Date().toISOString(),
    dias: ['2026-10-19', '2026-10-21', '2026-10-24'], diasRec: ['2026-10-24'],
    recVio: 1, recPidio: new Date().toISOString(),
    lec: { '1a': { ini: 'x', fin: 'x' }, '1b': { ini: 'x' } },
    niveles: { basico: new Date().toISOString() },
    repasos: [{ ok: 2, tot: 3 }], memoria: { '1a-2': 2, '1a-3': 0 }, abreDesdeIcono: 3
  });
}
