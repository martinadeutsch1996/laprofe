/**
 * LaProfe Digital · Pestaña "Piloto" de la planilla "LaProfe – datos"
 *
 * Pegar este código como un archivo nuevo en el Apps Script de la planilla
 * (Archivo → "+" → Secuencia de comandos → nombre: piloto).
 *
 * Después, en doPost, en la parte que guarda los datos de uso (la que recibe
 * {uid, data}, no la de Martina IA), sumar esta línea:
 *
 *     guardarPiloto(body.uid, body.data);
 *
 * (cambiar "body" por el nombre que tenga ahí el pedido ya leído con JSON.parse).
 * Por último: Implementar → Gestionar implementaciones → ✏️ → Nueva versión → Implementar.
 *
 * Crea sola la pestaña "Piloto" la primera vez. Una fila por alumno, con su código anónimo.
 */

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
  'Actualizado'
];

function guardarPiloto(uid, data) {
  if (!uid || !data) return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return; }
  try {
    var ss = SpreadsheetApp.openById(PILOTO_PLANILLA);
    var sh = ss.getSheetByName('Piloto') || ss.insertSheet('Piloto');
    if (sh.getLastRow() === 0) {
      sh.appendRow(PILOTO_COLUMNAS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, PILOTO_COLUMNAS.length).setFontWeight('bold');
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
    pilotoFecha_(new Date().toISOString())
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
