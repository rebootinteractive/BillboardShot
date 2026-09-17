import { validatePicture, type Picture } from './library';

/** Picture files, loaded by Vite. */
const files = import.meta.glob<Picture>('./pictures/*.json', { eager: true, import: 'default' });

/** Every picture in the library, by id, sorted by name. */
export const PICTURES: Map<string, Picture> = new Map(
  Object.values(files)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => [p.id, p]),
);

/** File name (without .json) for each picture id, so the checker can compare them. */
export const PICTURE_FILES: Map<string, string> = new Map(
  Object.entries(files).map(([path, p]) => [p.id, path.split('/').pop()!.replace(/\.json$/, '')]),
);

for (const [id, picture] of PICTURES) {
  const errors = validatePicture(picture, PICTURE_FILES.get(id));
  if (errors.length) console.error(`Picture ${id} is invalid:\n- ${errors.join('\n- ')}`);
}
