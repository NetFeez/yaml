import TestSuite from '@TestSuite/TestSuite';
import { astSuite } from './AST.test.js';
import { parserSuite } from './Parser.test.js';
import { serializerSuite } from './Serializer.test.js';
import { synchronizerSuite } from './Synchronizer.test.js';
import { compilerSuite } from './Compiler.test.js';

const suites: TestSuite[] = [compilerSuite, parserSuite, astSuite, serializerSuite, synchronizerSuite];

let passed = true;
for (const suite of suites) {
    passed = (await suite.run()) && passed;
}

if (passed) {
    console.log('All test suites passed.');
} else {
    console.error('Some test suites failed.');
    process.exit(1);
}
