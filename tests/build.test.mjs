import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repo_root = path.resolve(import.meta.dirname, '..');
const dist_dir = path.join(repo_root, 'dist');
const output_names = ['webslinger.js', 'webslinger.min.js', 'webslinger.dev.js'];

const read_output = (filename) => readFile(path.join(dist_dir, filename), 'utf8');

test('build creates all three browser bundles', async () => {
    for (const filename of output_names) {
        const output_stat = await stat(path.join(dist_dir, filename));
        assert.ok(output_stat.size > 0, `${filename} should not be empty`);
    }
});

test('production bundles contain no console calls or development log prefix', async () => {
    for (const filename of ['webslinger.js', 'webslinger.min.js']) {
        const source = await read_output(filename);
        assert.doesNotMatch(source, /\bconsole\s*(?:\.|\[)/);
        assert.doesNotMatch(source, /\[Webslinger\]\[/);
    }
});

test('development bundle contains the structured logger', async () => {
    const source = await read_output('webslinger.dev.js');
    assert.match(source, /\[Webslinger\]\[/);
    assert.match(source, /console\.(log|warn|error)/);
});

test('each bundle exposes the Webslinger constructor as a browser global', async () => {
    for (const filename of output_names) {
        const source = await read_output(filename);
        const context = vm.createContext({});
        vm.runInContext(source, context, { filename });
        assert.equal(typeof context.Webslinger, 'function');
    }
});

test('minified bundle is smaller than the standard bundle', async () => {
    const standard = await stat(path.join(dist_dir, 'webslinger.js'));
    const minified = await stat(path.join(dist_dir, 'webslinger.min.js'));
    assert.ok(minified.size < standard.size);
});
