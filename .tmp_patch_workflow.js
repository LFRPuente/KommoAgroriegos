const fs = require('fs');

try {
    // Leer el workflow descargado
    const wfPath = '.tmp_wf_before_recepcion_patch.json';
    if (!fs.existsSync(wfPath)) throw new Error('No se encontró el backup ' + wfPath);
    let raw = fs.readFileSync(wfPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // Strip BOM
    const wf = JSON.parse(raw);

    // ── Encontrar el nodo Limpiar Datos ──
    const limpiarNode = wf.nodes.find(n => n.name === 'Limpiar Datos');
    if (!limpiarNode) throw new Error('Nodo "Limpiar Datos" no encontrado');

    // ── Encontrar el nodo Upsert ──
    const upsertNode = wf.nodes.find(n => n.name.includes('Upsert'));
    if (!upsertNode) throw new Error('Nodo "Upsert" no encontrado');

    // ── Leer el código nuevo desde archivos ──
    const newLimpiar = fs.readFileSync('.tmp_limpiar_NEW.js', 'utf8');
    const newUpsertFn = fs.readFileSync('.tmp_upsert_toKommoDateTime_NEW.txt', 'utf8');

    // ── Aplicar código de Limpiar Datos ── (reemplazo total)
    limpiarNode.parameters.jsCode = newLimpiar;

    // ── Aplicar toKommoDateTime en Upsert ── (reemplazo parcial)
    const oldFnSignature = 'function toKommoDateTime(value) {';
    const oldCode = upsertNode.parameters.jsCode;
    const fnStart = oldCode.indexOf(oldFnSignature);
    if (fnStart === -1) throw new Error('No encontré toKommoDateTime en Upsert');

    // Encontrar el cierre de la función (buscar el "}\n" al nivel correcto)
    let braceCount = 0;
    let fnEnd = -1;
    for (let i = fnStart; i < oldCode.length; i++) {
        if (oldCode[i] === '{') braceCount++;
        if (oldCode[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                fnEnd = i + 1;
                break;
            }
        }
    }
    if (fnEnd === -1) throw new Error('No encontré el cierre de toKommoDateTime');

    upsertNode.parameters.jsCode = oldCode.slice(0, fnStart) + newUpsertFn + oldCode.slice(fnEnd);

    // ── Guardar el workflow modificado ──
    fs.writeFileSync('.tmp_wf_after_recepcion_patch.json', JSON.stringify(wf, null, 2), 'utf8');
    console.log('OK');
} catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
}
