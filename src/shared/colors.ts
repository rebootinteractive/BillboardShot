import type { ColorKey } from './types';

export const COLOR_KEYS: ColorKey[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'cyan',
  'pink',
  'brown',
  'lime',
  'black',
  'white',
];

export const CHAR_TO_COLOR: Record<string, ColorKey> = {
  R: 'red',
  B: 'blue',
  G: 'green',
  Y: 'yellow',
  P: 'purple',
  O: 'orange',
  C: 'cyan',
  M: 'pink',
  N: 'brown',
  L: 'lime',
  K: 'black',
  W: 'white',
};

export const COLOR_HEX: Record<ColorKey, number> = {
  red: 0xf74364,
  blue: 0x359be8,
  green: 0x46cf75,
  yellow: 0xffd34e,
  purple: 0xa675ec,
  orange: 0xff952f,
  cyan: 0x33cdd4,
  pink: 0xef77bc,
  brown: 0x8c5a3c,
  lime: 0xb6e04a,
  black: 0x3d3f4a,
  white: 0xf3f1ea,
};

export const COLOR_CSS: Record<ColorKey, string> = {
  red: '#f74364',
  blue: '#359be8',
  green: '#46cf75',
  yellow: '#ffd34e',
  purple: '#a675ec',
  orange: '#ff952f',
  cyan: '#33cdd4',
  pink: '#ef77bc',
  brown: '#8c5a3c',
  lime: '#b6e04a',
  black: '#3d3f4a',
  white: '#f3f1ea',
};
