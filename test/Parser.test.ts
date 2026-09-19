import TestSuite from '@TestSuite/TestSuite';
import TestContext from '@TestSuite/TestContext';
import { Compiler } from '../src/Compiler.js';
import YamlError from '../src/YamlError.js';
import { expectDeep } from './utils.js';

export const parserSuite = new TestSuite('parser');

function expectThrow(test: TestContext, text: string, unsupported: boolean): void {
    try {
        Compiler.parse(text);
    } catch (error) {
        test.expect(error).instanceOf(YamlError);
        const yamlError = error as YamlError;
        test.expect(yamlError.unsupported).equals(unsupported);
        test.expect(yamlError.status).equals(422);
        return;
    }
    throw new Error(`expected parse to throw: ${JSON.stringify(text)}`);
}

parserSuite.add('resolves plain scalars to primitives', (test) => {
    const yaml = 'a: null\nb: ~\nc:\nd: true\ne: false\nf: 42\ng: -17\nh: 0x1F\ni: 0o17\nj: 3.5\nk: 1e3\nl: .inf\nm: -.inf\nn: .nan\n';
    expectDeep(test, Compiler.compile(yaml), {
        a: null, b: null, c: null, d: true, e: false,
        f: 42, g: -17, h: 31, i: 15, j: 3.5, k: 1000,
        l: Infinity, m: -Infinity, n: NaN,
    });
    test.done();
});

parserSuite.add('parses quoted and escaped scalars', (test) => {
    const yaml = "a: 'single'\nb: \"double \\\"quoted\\\"\"\nc: 'it''s'\nd: \"line\\nbreak\"\ne: plain\n";
    expectDeep(test, Compiler.compile(yaml), {
        a: 'single', b: 'double "quoted"', c: "it's", d: 'line\nbreak', e: 'plain',
    });
    test.done();
});

parserSuite.add('keys may be plain or quoted', (test) => {
    expectDeep(test, Compiler.compile('plain: 1\n"quoted key": 2\n'), { plain: 1, 'quoted key': 2 });
    test.done();
});

parserSuite.add('parses block scalars with literal, folded and chomping', (test) => {
    const yaml = 'a: |\n  line one\n  line two\nb: >\n  folded line\n  continues\nc: |-\n  no break\nd: |+\n  keep\n\n';
    expectDeep(test, Compiler.compile(yaml), {
        a: 'line one\nline two\n',
        b: 'folded line continues\n',
        c: 'no break',
        d: 'keep\n',
    });
    test.done();
});

parserSuite.add('parses nested collections', (test) => {
    const yaml = 'users:\n  - name: alice\n    role: admin\n  - name: bob\n    role: dev\nmatrix:\n  - 1\n  - 2\n';
    expectDeep(test, Compiler.compile(yaml), {
        users: [{ name: 'alice', role: 'admin' }, { name: 'bob', role: 'dev' }],
        matrix: [1, 2],
    });
    test.done();
});

parserSuite.add('parses empty inline collections', (test) => {
    expectDeep(test, Compiler.compile('a: {}\nb: []\n'), { a: {}, b: [] });
    test.done();
});

parserSuite.add('detects the document indentation unit', (test) => {
    const doc = Compiler.parse('a:\n    b:\n        c: 1\n');
    test.expect(doc.unit).equals(4);
    test.done();
});

parserSuite.add('preserves comments, inline comments and document markers', (test) => {
    const yaml = '# top\na: 1 # inline\n# before b\nb: 2\n...\n';
    test.expect(Compiler.dump(Compiler.parse(yaml))).equals(yaml);
    test.done();
});

parserSuite.add('rejects unsupported features with YamlError', (test) => {
    expectThrow(test, '%YAML 1.2\na: 1\n', true);
    expectThrow(test, 'a: 1\n---\nb: 2\n', true);
    expectThrow(test, 'a: [1, 2]\n', true);
    expectThrow(test, 'a: &anchor value\n', true);
    expectThrow(test, 'a: 1\n  b: 2\n', true);
    expectThrow(test, 'a: 1\r\n', true);
    test.done();
});

parserSuite.add('rejects unterminated quoted scalars', (test) => {
    expectThrow(test, 'a: "unterminated\n', true);
    test.done();
});

parserSuite.add('rejects unexpected content after the root', (test) => {
    expectThrow(test, 'a: 1\nhello\n', true);
    test.done();
});