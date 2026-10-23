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
	assert.deepEqual(unexpected, [], 'files naming a retired source: reword them with "Forever\'s quest data", "the game\'s data" or "players\' reports"; additions to tools/lib/nameguard-allow.json are decided by the maintainers in review');
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

test('nameguard: the allowlist gives every file one of the known kinds', () => {
	const allow = guard.loadAllow();
	assert.ok(Object.keys(allow).length > 0);
	assert.ok(Object.values(allow).every((r) => ['excluded', 'phase2', 'guard'].includes(r)));
	const bad = path.join(os.tmpdir(), `nameguard-allow-${process.pid}.json`);
	fs.writeFileSync(bad, JSON.stringify({ files: { 'a.js': 'later' } }));
	assert.throws(() => guard.loadAllow(bad), /kind "later"/);
	fs.rmSync(bad);
});

test('nameguard: the allowlist only shrinks: no new phase2 entries; a new entry is excluded with a reason', () => {
	const shipped = JSON.parse(fs.readFileSync(guard.ALLOW, 'utf8')).files;
	const tmp = path.join(os.tmpdir(), `nameguard-shrink-${process.pid}.json`);
	const load = (files) => {
		fs.writeFileSync(tmp, JSON.stringify({ files }));
		return () => guard.loadAllow(tmp);
	};
	// Today's entries load, and dropping one is fine.
	const [first, ...rest] = Object.keys(shipped);
	assert.doesNotThrow(load(shipped));
	assert.doesNotThrow(load(Object.fromEntries(rest.map((f) => [f, shipped[f]]))));
	assert.ok(first);
	// A new file listed as phase2 (or as a bare "excluded") is refused.
	assert.throws(load({ ...shipped, 'tools/lib/new-code.js': 'phase2' }), /only shrinks/);
	assert.throws(load({ ...shipped, 'docs/NEW.md': 'excluded' }), /only shrinks/);
	// An original phase2 entry cannot move to another path, nor become something new.
	const p2 = Object.keys(shipped).find((f) => shipped[f] === 'phase2');
	assert.throws(load({ ...shipped, [p2]: { kind: 'phase2', reason: 'x' } }), /must be \{ "kind": "excluded"/);
	// A new entry agreed in review: excluded, with its reason.
	assert.throws(load({ ...shipped, 'docs/NEW.md': { kind: 'excluded' } }), /reason/);
	assert.deepEqual(load({ ...shipped, 'docs/NEW.md': { kind: 'excluded', reason: 'a licence notice quoting the source name' } })()['docs/NEW.md'], 'excluded');
	fs.rmSync(tmp);
});
