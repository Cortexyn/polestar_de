'use strict';
// The name guard (tools/lib/nameguard.js): no tracked file names the web quest
// databases the project no longer cites, except the allowlisted ones, and the
// allowlist only shrinks.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const guard = require('../tools/lib/nameguard');

const ROOT = path.join(__dirname, '..');
const isRepo = fs.existsSync(path.join(ROOT, '.git'));

test('nameguard: the names are built from parts and this repository names them only where allowed', { skip: !isRepo && 'not a git checkout' }, () => {
	assert.equal(guard.names().length, 3);
	const allow = guard.loadAllow();
	const { unexpected, stale } = guard.checkMentions(guard.mentions(ROOT), allow);
	assert.deepEqual(unexpected, [], 'files naming a retired source: write "Forever\'s quest data", "the game\'s data" or "players\' reports" instead (or, for code, list the file in tools/lib/nameguard-allow.json as phase2)');
	assert.deepEqual(stale, [], 'allowlisted files that no longer name one: drop them from tools/lib/nameguard-allow.json');
});

test('nameguard: a new mention fails, a cleaned allowlisted file fails until it leaves the list', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nameguard-'));
	const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
	git('init', '-q');
	const [site] = guard.names();
	fs.writeFileSync(path.join(dir, 'kept.js'), `// legacy tag: ${site}\n`);
	fs.writeFileSync(path.join(dir, 'clean.md'), 'Checked against Forever\'s quest data.\n');
	git('add', '.');
	const allow = { 'kept.js': 'phase2' };
	assert.deepEqual(guard.checkMentions(guard.mentions(dir), allow), { unexpected: [], stale: [] });
	// Before: a doc cites the site again -> the guard names the file.
	fs.writeFileSync(path.join(dir, 'clean.md'), `Checked on ${site[0].toUpperCase()}${site.slice(1)} Forever.\n`);
	assert.deepEqual(guard.checkMentions(guard.mentions(dir), allow).unexpected, ['clean.md']);
	// After: reworded -> clean again.
	fs.writeFileSync(path.join(dir, 'clean.md'), 'Checked against Forever\'s quest data.\n');
	assert.deepEqual(guard.checkMentions(guard.mentions(dir), allow).unexpected, []);
	// An allowlisted file that no longer names it is stale: the list must shrink.
	fs.writeFileSync(path.join(dir, 'kept.js'), '// legacy tag: renamed\n');
	assert.deepEqual(guard.checkMentions(guard.mentions(dir), allow).stale, ['kept.js']);
	fs.rmSync(dir, { recursive: true, force: true });
});

test('nameguard: the allowlist gives every file one of the known reasons', () => {
	const allow = guard.loadAllow();
	assert.ok(Object.keys(allow).length > 0);
	assert.ok(Object.values(allow).every((r) => ['excluded', 'phase2', 'guard'].includes(r)));
	const bad = path.join(os.tmpdir(), `nameguard-allow-${process.pid}.json`);
	fs.writeFileSync(bad, JSON.stringify({ files: { 'a.js': 'later' } }));
	assert.throws(() => guard.loadAllow(bad), /reason "later"/);
	fs.rmSync(bad);
});
