'use strict';
// `gear build`: the inputs of Polestar's upgrade advice -> the addon's data.
//
// Committed (MIT material and Polestar's own numbers):
//   addon/Polestar_ItemDB/Forever.lua      ForeverLevelingBiS: Forever item stats
//                                          over the Era table, quest reward choices
//   addon/Polestar_ItemDB/*.toc            lists Forever.lua after Items.lua
//   addon/Polestar_ItemDB/LICENSE-DATA.txt its MIT notice
//   addon/Polestar/Gear/SpecData.lua       weight bands (Polestar + wowsims),
//                                          racials (ForeverLevelingBiS)
//   addon/Polestar/Gear/LICENSE-DATA.txt   the MIT notices of both
// Local: data/forever/gear/report.json (counts and provenance of this run).
//
// ForeverLevelingBiS is required, in an MIT-licensed version (any other is
// refused and nothing is written); without the wowsims cache the bands are
// Polestar's own weights, and the report says so.

const fs = require('node:fs');
const path = require('node:path');
const { readForeverLevelingBiS } = require('../consume/foreverlevelingbis');
const { buildForeverPack } = require('./leveling');
const { weightBands, racials, emitSpecData } = require('./specdata');
const { emitToc, packFiles, packageVersion, ADDON: ITEMDB } = require('../itemdb/build');

const { ROOT, DATA } = require('../paths');
const WOWSIMS_LICENCE = path.join('classic', '7779ebbf79dc7f1341e6ab939b28a3402c9a730a', 'LICENSE');

function writeAtomic(file, text) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(`${file}.tmp`, text);
	fs.renameSync(`${file}.tmp`, file);
}

const notice = (what, text) => `${what}\n\n${text.trim()}\n`;

// -> report
async function buildGear({ addons, root = ROOT, wowsimsCache, log = () => {} } = {}) {
	const gaps = [];
	const itemDir = path.join(root, 'addon', ITEMDB);
	const eraFile = path.join(itemDir, 'Items.lua');
	if (!fs.existsSync(eraFile)) throw new Error(`${path.relative(root, eraFile)} missing: run \`itemdb build\` first`);

	// 1. ForeverLevelingBiS -> Polestar_ItemDB/Forever.lua. The reader refuses a
	// copy that is not MIT-licensed before anything here is written.
	const flb = readForeverLevelingBiS({ addons });
	const pack = buildForeverPack(flb, fs.readFileSync(eraFile, 'utf8'));
	writeAtomic(path.join(itemDir, 'Forever.lua'), pack.lua);
	fs.writeFileSync(path.join(itemDir, `${ITEMDB}.toc`), emitToc(packageVersion(), packFiles(itemDir)));
	const flbLicence = flb.licence;
	writeAtomic(path.join(itemDir, 'LICENSE-DATA.txt'), notice('Forever.lua holds facts derived from ForeverLevelingBiS by Thunder:', flbLicence));

	// 2. wowsims (MIT; the cache only, `gear fetch` refreshes it)
	const simCache = wowsimsCache || path.join(root, 'data', 'sources', 'wowsims');
	let wowsims = null;
	try {
		wowsims = await require('../consume/wowsims').readWowsims({ cacheDir: simCache });
	} catch (err) {
		gaps.push(`wowsims: ${err.message}; the bands are Polestar's own weights`);
		log(`wowsims: not used (${err.message})`);
	}

	// 3. SpecData.lua and its notices
	const { bands, counts: bandCounts } = weightBands(wowsims);
	const specData = emitSpecData({ bands, racials: racials(flb), wowsimsMeta: wowsims && wowsims.meta, flbMeta: flb.meta });
	writeAtomic(path.join(root, 'addon', 'Polestar', 'Gear', 'SpecData.lua'), specData);
	const parts = [notice('SpecData.lua: racial gear traits derived from ForeverLevelingBiS by Thunder:', flbLicence)];
	if (wowsims && fs.existsSync(path.join(simCache, WOWSIMS_LICENCE))) {
		parts.push(notice('SpecData.lua: stat weights derived from wowsims (https://github.com/wowsims):', fs.readFileSync(path.join(simCache, WOWSIMS_LICENCE), 'utf8')));
	}
	writeAtomic(path.join(root, 'addon', 'Polestar', 'Gear', 'LICENSE-DATA.txt'), parts.join('\n'));

	const report = {
		builtAt: new Date().toISOString(),
		foreverLevelingBiS: { ...flb.meta, pack: pack.counts, bytes: Buffer.byteLength(pack.lua) },
		wowsims: wowsims ? { meta: wowsims.meta, bands: bandCounts, rejected: (wowsims.rejected || []).length } : null,
		specDataBytes: Buffer.byteLength(specData),
		gaps,
	};
	writeAtomic(path.join(root, 'data', 'forever', 'gear', 'report.json'), JSON.stringify(report, null, '\t'));
	return report;
}

module.exports = { buildGear };
