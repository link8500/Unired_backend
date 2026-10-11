/* Revisión estructural del modelo PostgreSQL. Complementa, no reemplaza, su ejecución real. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sql = fs.readFileSync(path.join(__dirname, '01_modelo_postgresql.sql'), 'utf8');
assert(!/^\s*(DROP|TRUNCATE|DELETE|INSERT|UPDATE)\s/gmi.test(sql), 'No se admiten operaciones destructivas/DML en el modelo.');
assert(!/ENGINE=|AUTO_INCREMENT|\bUNSIGNED\b|DATETIME|UNIQUE KEY/.test(sql), 'Queda sintaxis MySQL.');
function split(value) {
  let depth = 0, quoted = false, current = '';
  const items = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "'") {
      if (quoted && value[i + 1] === "'") { current += c + value[++i]; continue; }
      quoted = !quoted;
    }
    if (!quoted) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) { items.push(current.trim()); current = ''; continue; }
    }
    current += c;
  }
  assert(!quoted && depth === 0, 'Definición desbalanceada.');
  if (current.trim()) items.push(current.trim());
  return items;
}
const tables = new Map();
let fkCount = 0, checkCount = 0;
for (const match of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]+?)\n\);/g)) {
  const name = match[1], columns = new Map(), keys = [], fks = [];
  for (const item of split(match[2])) {
    const field = item.match(/^([a-z_][a-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*(?:\(\d+(?:,\d+)?\))?)/);
    if (field) { assert(!columns.has(field[1])); columns.set(field[1], field[2]); continue; }
    const key = item.match(/^(?:PRIMARY KEY|CONSTRAINT \w+ UNIQUE) \(([^)]+)\)$/);
    if (key) { keys.push(key[1].split(',').map(s => s.trim())); continue; }
    const fk = item.match(/^CONSTRAINT \w+ FOREIGN KEY \(([^)]+)\) REFERENCES (\w+) \(([^)]+)\)$/);
    if (fk) { fks.push({ columns: fk[1].split(',').map(s => s.trim()), table: fk[2], target: fk[3].split(',').map(s => s.trim()) }); fkCount++; continue; }
    assert(/^CONSTRAINT \w+ CHECK \([\s\S]+\)$/.test(item), 'Definición desconocida: ' + item); checkCount++;
  }
  for (const key of keys) for (const col of key) assert(columns.has(col), 'Clave sin columna.');
  for (const fk of fks) {
    const parent = tables.get(fk.table);
    assert(parent, 'FK a tabla futura/inexistente.');
    assert(parent.keys.some(k => JSON.stringify(k) === JSON.stringify(fk.target)), 'FK sin UNIQUE/PK.');
    fk.columns.forEach((col, index) => assert.equal(columns.get(col), parent.columns.get(fk.target[index]), 'Tipo FK incompatible.'));
  }
  assert(!tables.has(name)); tables.set(name, { columns, keys, fks });
}
assert.equal(tables.size, 42);
for (const required of ['archivos','variantes_archivo','galeria_tutoria','imagenes_anuncio','documentos_solicitud','lecciones_tutoria']) assert(tables.has(required));
assert(sql.includes('CREATE UNIQUE INDEX uq_solicitud_abierta'));
assert(sql.includes('banner_archivo_id') && sql.includes('TIMESTAMPTZ') && sql.includes('JSONB'));
console.log(JSON.stringify({ motor: 'postgresql', tablas: tables.size, claves_foraneas: fkCount, checks: checkCount, validacion: 'estructural_offline' }, null, 2));
