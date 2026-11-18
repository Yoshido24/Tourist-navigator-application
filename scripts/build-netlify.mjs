import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildNetlifySite(outputDirectory = path.join(projectRoot, 'dist', 'netlify')) {
  mkdirSync(outputDirectory, { recursive: true });

  for (const file of ['index.html', 'user.html', 'guide.html', 'admin.html', '_headers']) {
    cpSync(path.join(projectRoot, file), path.join(outputDirectory, file));
  }
  for (const directory of ['apps', 'assets', 'frontend']) {
    cpSync(path.join(projectRoot, directory), path.join(outputDirectory, directory), { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildNetlifySite();
}
