// Keep the installed-app and browser mark consistent with the Samin Studio brand.
import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../public/icon.svg', import.meta.url), new URL('../src/app/icon.svg', import.meta.url));
console.log('Samin Studio brand assets updated.');
