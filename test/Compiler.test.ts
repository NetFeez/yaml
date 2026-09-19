import TestSuite from '@TestSuite/TestSuite';
import { Compiler } from '../src/Compiler.js';
import { expectDeep } from './utils.js';

export const compilerSuite = new TestSuite('compiler');

compilerSuite.add('compiles a raw document to JSON-compatible data', (test) => {
    const yaml = 'name: yaml\nversion: 0.1\nengines:\n  node: true\n';
    expectDeep(test, Compiler.compile(yaml), { name: 'yaml', version: 0.1, engines: { node: true } });
    test.done();
});

compilerSuite.add('compiles an existing document tree', (test) => {
    const doc = Compiler.parse('a:\n  - 1\n  - 2\n');
    expectDeep(test, Compiler.compile(doc), { a: [1, 2] });
    test.done();
});

compilerSuite.add('extracts map comments keyed by path', (test) => {
    const yaml = '# document comment\nserver:\n  # host address\n  host: localhost\n  port: 8080 # exposed port\n';
    expectDeep(test, Compiler.comments(Compiler.parse(yaml)), {
        server: 'document comment',
        'server.host': 'host address',
    });
    test.done();
});

compilerSuite.add('supports a full read-modify-write workflow', (test) => {
    const yaml = '# Service config\nserver:\n  host: localhost\n  port: 8080\n  features:\n    - logging\n    - metrics\n';
    const doc = Compiler.parse(yaml);
    expectDeep(test, Compiler.compile(doc), {
        server: { host: 'localhost', port: 8080, features: ['logging', 'metrics'] },
    });
    Compiler.apply(doc, {
        server: { host: 'localhost', port: 9090, features: ['logging', 'metrics', 'tracing'] },
    });
    test.expect(Compiler.dump(doc)).equals(
        '# Service config\nserver:\n  host: localhost\n  port: 9090\n  features:\n    - logging\n    - metrics\n    - tracing\n'
    );
    test.done();
});