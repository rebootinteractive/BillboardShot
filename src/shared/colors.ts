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
};

export const COLOR_HEX: Record<ColorKey, number> = {
  red: 0xff5a5f,
  blue: 0x4d9ef7,
  green: 0x43d17c,
  yellow: 0xffd166,
  purple: 0xb07df7,
  orange: 0xff8a1f,
  cyan: 0x22cfe0,
  pink: 0xff6ec7,
};

export const COLOR_CSS: Record<ColorKey, string> = {
  red: '#ff5a5f',
  blue: '#4d9ef7',
  green: '#43d17c',
  yellow: '#ffd166',
  purple: '#b07df7',
  orange: '#ff8a1f',
  cyan: '#22cfe0',
  pink: '#ff6ec7',
};
