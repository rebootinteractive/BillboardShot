export type ColorKey =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'pink';

export interface ShapeDef {
  id: string;
  name: string;
  /** Rows top-to-bottom. Chars: R B G Y P for colors, '.' for empty. */
  rows: string[];
}
