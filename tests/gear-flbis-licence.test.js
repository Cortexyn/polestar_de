'use strict';
// `gear build` and `codex build` only build from MIT-licensed ForeverLevelingBiS
// versions (tools/lib/consume/foreverlevelingbis.js mitLicence): a copy whose
// LICENSE is not the MIT licence is refused before anything is written.
// Fixture: tests/fixtures/consume/flbis-not-mit (made-up data and notice).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildGear } = require('../tools/lib/gear/build');
const { mitLicence } = require('../tools/lib/consume/foreverlevelingbis');
const { tmpdir } = require('./helpers/tmp');

const NOT_MIT = path.join(__dirname, 'fixtures', 'consume', 'flbis-not-mit');
const REPO = path.join(__dirname, '..');

// The committed files gear build writes, as a scratch checkout holds them.
const OUTPUTS = ['addon/Polestar_ItemDB/Forever.lua', 'addon/Polestar_ItemDB/LICENSE-DATA.txt', 'addon/Polestar/Gear/SpecData.lua', 'addon/Polestar/Gear/LICENSE-DATA.txt'];

test('gear build refuses a ForeverLevelingBiS that is not MIT-licensed and writes nothing', async () => {
	const root = tmpdir('polestar-flbis-');
	const files = ['addon/Polestar_ItemDB/Items.lua', ...OUTPUTS];
	for (const f of files) {
		fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
		fs.writeFileSync(path.join(root, f), `-- ${f} before the build\n`);
	}
	const toc = path.join(root, 'addon/Polestar_ItemDB/Polestar_ItemDB.toc');
	await assert.rejects(buildGear({ addons: NOT_MIT, root }), (err) => {
		assert.equal(err.code, 'FLBIS_NOT_MIT');
		assert.match(err.message, /9\.9\.9-fixture/);
		assert.match(err.message, /only builds from MIT-licensed ForeverLevelingBiS versions/);
		return true;
	});
	for (const f of files) assert.equal(fs.readFileSync(path.join(root, f), 'utf8'), `-- ${f} before the build\n`, `${f} changed`);
	assert.ok(!fs.existsSync(toc), 'the ItemDB TOC was written');
	assert.ok(!fs.existsSync(path.join(root, 'data/forever/gear/report.json')), 'report.json was written');
});

test('the MIT notice the shipped data came from passes the licence check', () => {
	// addon/Polestar_ItemDB/LICENSE-DATA.txt: one line naming the source, then its MIT licence.
	const shipped = fs.readFileSync(path.join(REPO, 'addon/Polestar_ItemDB/LICENSE-DATA.txt'), 'utf8').split('\n').slice(2).join('\n');
	const dir = tmpdir('polestar-flbis-mit-');
	fs.writeFileSync(path.join(dir, 'LICENSE'), shipped);
	assert.equal(mitLicence(dir), shipped);
	fs.rmSync(path.join(dir, 'LICENSE'));
	assert.throws(() => mitLicence(dir), (err) => err.code === 'FLBIS_NOT_MIT' && /no LICENSE file/.test(err.message));
});
