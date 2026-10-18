/** Compare shared/catalog.ts against src/tools/*.tsx and print missing slugs. */
import fs from 'node:fs';

const source = fs.readFileSync('shared/catalog.ts', 'utf8');
const slugs = [...source.matchAll(/slug: '([^']+)'/g)].map((match) => match[1]);
const files = new Set(
  fs
    .readdirSync('src/tools')
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => name.replace(/\.tsx$/, '')),
);
const missing = slugs.filter((slug) => !files.has(slug));
console.log(`catalog=${slugs.length} implemented=${slugs.length - missing.length} missing=${missing.length}`);
for (const slug of missing) console.log(`- ${slug}`);
