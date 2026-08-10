import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  'napcat-types',
];

function copyPackageAssets() {
  return {
    name: 'copy-package-assets',
    writeBundle() {
      const dist = resolve(__dirname, 'dist');
      const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

      const distPackage = {
        name: pkg.name,
        plugin: pkg.plugin,
        version: pkg.version,
        type: 'module',
        main: 'index.mjs',
        description: pkg.description,
        author: pkg.author,
        license: pkg.license,
        engines: pkg.engines,
        napcat: pkg.napcat,
      };

      fs.writeFileSync(
        resolve(dist, 'package.json'),
        `${JSON.stringify(distPackage, null, 2)}\n`,
      );

      for (const file of ['LICENSE', 'README.md']) {
        const source = resolve(__dirname, file);
        if (fs.existsSync(source)) fs.copyFileSync(source, resolve(dist, file));
      }
    },
  };
}

export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        snowluma: resolve(__dirname, 'src/runtime/snowluma.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
        inlineDynamicImports: false,
      },
    },
  },
  plugins: [copyPackageAssets()],
});
