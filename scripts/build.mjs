import { build } from 'esbuild';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script_dir = path.dirname(fileURLToPath(import.meta.url));
const repo_root = path.resolve(script_dir, '..');
const dist_dir = path.join(repo_root, 'dist');
const entry_file = path.join(repo_root, 'src', 'browser.js');
const package_json = JSON.parse(await readFile(path.join(repo_root, 'package.json'), 'utf8'));

const disabled_logger = `
const no_op = () => {};
const logger = Object.freeze({
    debug: no_op,
    info: no_op,
    warn: no_op,
    error: no_op,
});
export const create_logger = () => logger;
export const describe_url = (value) => {
    const url = String(value ?? '');
    const separator_index = url.search(/[?#]/);
    return separator_index === -1 ? url : url.slice(0, separator_index);
};
`;

const disable_logging = {
    name: 'disable-webslinger-logging',
    setup(build_context) {
        build_context.onResolve({ filter: /\/logger\.js$/ }, () => ({
            path: 'disabled-logger',
            namespace: 'webslinger-build',
        }));

        build_context.onLoad(
            { filter: /^disabled-logger$/, namespace: 'webslinger-build' },
            () => ({ contents: disabled_logger, loader: 'js' }),
        );
    },
};

const build_output = async ({ filename, development = false, minify = false }) => {
    const build_type = development ? 'development' : 'production';

    await build({
        entryPoints: [entry_file],
        outfile: path.join(dist_dir, filename),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        minify,
        legalComments: 'none',
        plugins: development ? [] : [disable_logging],
        banner: {
            js: `/*! Webslinger v${package_json.version} | ${build_type} build | MIT License */`,
        },
    });
};

await rm(dist_dir, { recursive: true, force: true });
await mkdir(dist_dir, { recursive: true });

await Promise.all([
    build_output({ filename: 'webslinger.js' }),
    build_output({ filename: 'webslinger.min.js', minify: true }),
    build_output({ filename: 'webslinger.dev.js', development: true }),
]);

console.log('Built dist/webslinger.js, dist/webslinger.min.js, and dist/webslinger.dev.js');
