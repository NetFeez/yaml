/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Registers the `@TestSuite` resolver hook into Node's module loader.
 * @license Apache-2.0
 */

import { register } from 'node:module';

register('./_resolver.mjs', import.meta.url);