/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Test runner entry point: runs the YAML test suite and exits with a non-zero code on failure.
 * @license Apache-2.0
 */

import TestSuite from '@TestSuite/TestSuite';

import { yamlSuite } from './Yaml.test.js';
import Logger from '@netfeez/vterm';

const logger = new Logger({ name: 'suite:main', logger: Logger.default });
const suites: TestSuite[] = [yamlSuite];

let passed = true;
for (const suite of suites) passed = await suite.run() && passed;

if (passed) {
    logger.log('&C2✔ All test suites passed.');
} else {
    logger.error('Some test suites failed.');
    process.exit(1);
}