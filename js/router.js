// Minimal hash-based client-side router. Single-page app: sections are
// swapped in the main panel without full page loads (chosen over separate
// HTML files — simpler deploy + shared state; see README).

import { NAV_ORDER } from './schema.js';

let handler = () => {};

export function currentRoute() {
  const key = (location.hash || '').replace(/^#\/?/, '') || NAV_ORDER[0];
  return NAV_ORDER.includes(key) ? key : NAV_ORDER[0];
}

export function navigate(key) {
  location.hash = `#/${key}`;
}

export function onRoute(fn) {
  handler = fn;
  window.addEventListener('hashchange', () => handler(currentRoute()));
}

export function start() {
  if (!location.hash) location.hash = `#/${NAV_ORDER[0]}`;
  handler(currentRoute());
}
