/**
 * JEST Polyfills - Runs before test environment is created
 * 
 * This file polyfills TextEncoder/TextDecoder for jsdom compatibility.
 * It runs in Node.js context (not jsdom) via setupFiles.
 */

import { TextEncoder, TextDecoder } from "node:util";

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}
if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}
