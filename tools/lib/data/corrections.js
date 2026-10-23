'use strict';
// The corrections `data build` applies: tools/lib/data/corrections.json (public,
// every entry with an independent `source`) with the private overlay merged over
// it when the maintainer has one (data/local/corrections-private.json, not in the
// repository: fixes whose only support is a source we don't publish).

const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../paths');

const PUBLIC_FILE = path.join(__dirname, 'corrections.json');
const PRIVATE_FILE = path.join('data', 'local', 'corrections-private.json');
const SOURCE_KINDS = ['recording', 'in-game-check', 'client', 'eg', 'cmangos', 'tdb', 'questie', 'pfquest', 'factoruide'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(a, b) {
	if (!isObj(a) || !isObj(b)) return b;
	const out = { ...a };
	for (const [k, v] of Object.entries(b)) out[k] = k in out ? merge(out[k], v) : v;
	return out;
}

// Per section (quests, npcs, objects, items) and id: an entry only the overlay
// has is added; one both have is merged key by key, the overlay's object values
// merged into ours and its other values replacing ours. Keys starting with `_`
// (`_about`) stay the public file's.
function overlayCorrections(pub, priv) {
	const out = structuredClone(pub);
	for (const [section, ids] of Object.entries(priv || {})) {
		if (section.startsWith('_') || !isObj(ids)) continue;
		if (!isObj(out[section])) out[section] = {};
		for (const [id, entry] of Object.entries(ids)) out[section][id] = id in out[section] ? merge(out[section][id], entry) : entry;
	}
	return out;
}

// The private overlay. privateFile: undefined -> <root>/data/local/corrections-private.json
// when it exists; false -> none; a path -> that file (it must exist). -> { file, data } or null.
function loadPrivateCorrections({ root = ROOT, privateFile } = {}) {
	if (privateFile === false) return null;
	const file = privateFile || path.join(root, PRIVATE_FILE);
	if (!privateFile && !fs.existsSync(file)) return null;
	return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

// The public corrections with the private overlay (loadPrivateCorrections) merged over them.
function loadCorrections(options = {}) {
	const pub = JSON.parse(fs.readFileSync(PUBLIC_FILE, 'utf8'));
	const priv = loadPrivateCorrections(options);
	return priv ? overlayCorrections(pub, priv.data) : pub;
}

module.exports = { loadCorrections, loadPrivateCorrections, overlayCorrections, PUBLIC_FILE, PRIVATE_FILE, SOURCE_KINDS };
