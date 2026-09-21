/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Test suite for the YAML library: parsing, serialization, mutations, comments, sync and round-trip stress cases.
 * @license Apache-2.0
 */

import TestSuite from '@TestSuite/TestSuite';
import TestContext from '@TestSuite/TestContext';
import {
    Yaml, Document, Node, MapNode, ListNode, ScalarNode,
    Parser, Serializer, Synchronizer, YamlError, JsonValue, NodeType,
    isMap, isList, isScalar, isDocument, DOCUMENT, NODE,
} from '../src/index.js';
import { expectDeep } from './utils.js';

/** The YAML test suite: parse/dump/toJS, mutations, comments, sync and round-trip stress cases. */
export const yamlSuite = new TestSuite('yaml');

/**
 * Asserts that a function throws a `YamlError`, optionally matching its message and unsupported flag.
 * @param test - The test context to assert through.
 * @param fn - The function expected to throw.
 * @param match - A regex the error message must match (defaults to matching anything).
 * @param unsupported - When provided, the error's unsupported flag must equal this value.
 * @throws If the function does not throw a `YamlError`, or the message/flag do not match.
 */
function expectThrow(test: TestContext, fn: () => unknown, match = /./, unsupported?: boolean): void {
    try {
        fn();
    } catch (error) {
        test.expect(error).instanceOf(YamlError);
        const yamlError = error as YamlError;
        if (unsupported !== undefined) test.expect(yamlError.unsupported).equals(unsupported);
        if (!match.test(yamlError.message)) throw new Error(`expected error matching ${match} but got: ${yamlError.message}`);
        return;
    }
    throw new Error('expected an error to be thrown');
}

// ============ parse / dump / toJS ============

yamlSuite.add('round-trips parsed text byte-for-byte', (test) => {
    const yaml = '# top comment\na: 1 # inline\nb:\n  - x\n  - y\nc: |\n  line1\n  line2\n';
    const doc = Yaml.parse(yaml);
    test.expect(doc).instanceOf(Document);
    test.expect(doc.dump()).equals(yaml);
    test.done();
});

yamlSuite.add('parse accepts document markers and header/footer', (test) => {
    const yaml = '---\n# header\na: 1\n...\n# footer\n';
    const doc = Yaml.parse(yaml);
    expectDeep(test, doc.toJS(), { a: 1 });
    test.expect(doc.dump()).equals(yaml);
    test.done();
});

yamlSuite.add('toJS projects the tree to plain data', (test) => {
    const doc = Yaml.parse('a:\n  b:\n    c: Hola\n');
    expectDeep(test, doc.toJS(), { a: { b: { c: 'Hola' } } });
    test.done();
});

yamlSuite.add('resolves plain scalars to primitives', (test) => {
    const doc = Yaml.parse('a: null\nb: ~\nc:\nd: true\ne: 42\nf: 0x1F\ng: 3.5\nh: .inf\ni: .nan\n');
    expectDeep(test, doc.toJS(), {
        a: null, b: null, c: null, d: true, e: 42, f: 31, g: 3.5, h: Infinity, i: NaN,
    });
    test.done();
});

yamlSuite.add('parses quoted, escaped and block scalars', (test) => {
    const doc = Yaml.parse("a: 'single'\nb: \"line\\nbreak\"\nc: |\n  raw\n  text\nd: >\n  folded\n  words\n");
    expectDeep(test, doc.toJS(), { a: 'single', b: 'line\nbreak', c: 'raw\ntext\n', d: 'folded words\n' });
    test.done();
});

// ============ value / children / identity ============

yamlSuite.add('doc.value chains to plain data (doc.value.a.b.c)', (test) => {
    const doc = Yaml.parse('a:\n  b:\n    c: Hola\n');
    const value = doc.value as { a: { b: { c: string } } };
    test.expect(value.a.b.c).equals('Hola');
    test.done();
});

yamlSuite.add('doc.children exposes wrapped branches in source order', (test) => {
    const doc = Yaml.parse('a:\n  b:\n    c: Hola\n');
    const a = doc.getMap('a')!;
    const b = a.children.b as MapNode;
    const c = b.children.c as ScalarNode;
    test.expect(a).instanceOf(Node);
    test.expect(c).instanceOf(ScalarNode);
    test.expect(c.value).equals('Hola');
    test.done();
});

yamlSuite.add('doc.get returns the identical cached wrapper (doc.get(a) === doc.children.a)', (test) => {
    const doc = Yaml.parse('a: 1\nb:\n  c: 2\n');
    const children = doc.children as Record<string, Node>;
    test.expect(doc.get('a')).equals(children.a);
    test.expect(doc.get('a')).equals(doc.get('a'));
    test.expect(doc.get('b.c')).equals((children.b as MapNode).children.c);
    test.done();
});

yamlSuite.add('scalar value assignment re-renders the line in place', (test) => {
    const doc = Yaml.parse("a: 'original'\n");
    const a = doc.get('a') as ScalarNode;
    a.value = 'changed';
    expectDeep(test, doc.toJS(), { a: 'changed' });
    // A modified scalar is always re-rendered from its value (minimal quoting), never from stale source text.
    test.expect(doc.dump()).equals('a: changed\n');
    test.done();
});

yamlSuite.add('container value assignment rebuilds children at the entry indentation', (test) => {
    const doc = Yaml.parse('a:\n  b: 1\n  c: 2\n');
    (doc.get('a') as MapNode).value = { x: 10, y: 20 };
    expectDeep(test, doc.toJS(), { a: { x: 10, y: 20 } });
    test.expect(doc.dump()).equals('a:\n  x: 10\n  y: 20\n');
    test.done();
});

yamlSuite.add('shape mismatches on value assignment throw YamlError', (test) => {
    const doc = Yaml.parse('a: 1\nb:\n  c: 2\n');
    expectThrow(test, () => { (doc.get('a') as ScalarNode).value = { bad: 1 } as never; });
    expectThrow(test, () => { (doc.get('b') as MapNode).value = 5; });
    expectThrow(test, () => { (doc.get('b') as MapNode).value = [1, 2]; });
    test.done();
});

yamlSuite.add('doc.value assignment replaces the root', (test) => {
    const doc = Yaml.parse('a:\n  b: 1\n');
    doc.value = { fresh: true };
    expectDeep(test, doc.toJS(), { fresh: true });
    test.expect(doc.dump()).equals('fresh: true\n');
    test.done();
});

// ============ get / set / delete / pathing ============

yamlSuite.add('set auto-creates intermediate containers', (test) => {
    const doc = Yaml.create();
    doc.set('c.d.e', 'deep');
    expectDeep(test, doc.toJS(), { c: { d: { e: 'deep' } } });
    test.expect(doc.dump()).equals('c:\n  d:\n    e: deep');
    test.done();
});

yamlSuite.add('set resolves through existing containers, updating scalars in place', (test) => {
    const doc = Yaml.parse('a:\n  b: 1\n');
    doc.set('a.b', 42);
    expectDeep(test, doc.toJS(), { a: { b: 42 } });
    test.done();
});

yamlSuite.add('set on a scalar keeps the scalar node identity at the destination', (test) => {
    const doc = Yaml.parse('a:\n  b: 1\n');
    const b = doc.get('a.b');
    test.expect(b).instanceOf(ScalarNode);
    const attached = doc.set('a.b', 99);
    test.expect(attached).equals(b); // same wrapper: in-place update
    test.expect(doc.dump()).equals('a:\n  b: 99\n');
    test.done();
});

yamlSuite.add('set validates explicit types before mutating', (test) => {
    const doc = Yaml.create();
    expectThrow(test, () => doc.set('x', 'nope', 'number'));
    expectDeep(test, doc.toJS(), {}); // untouched
    doc.set('x', 3, 'number');
    expectDeep(test, doc.toJS(), { x: 3 });
    test.done();
});

yamlSuite.add('get/set/delete route through containers', (test) => {
    const doc = Yaml.parse('a: 1\n');
    doc.set('b.c', 2);
    expectDeep(test, doc.toJS(), { a: 1, b: { c: 2 } });
    test.expect(doc.delete('a')).equals(true);
    test.expect(doc.delete('missing')).equals(false);
    expectDeep(test, doc.toJS(), { b: { c: 2 } });
    test.done();
});

yamlSuite.add('delete never garbage-collects empty parents', (test) => {
    const doc = Yaml.parse('a:\n  b:\n    c: 1\n');
    test.expect(doc.delete('a.b.c')).equals(true);
    test.expect(doc.delete('a.b.c')).equals(false);
    expectDeep(test, doc.toJS(), { a: { b: {} } });
    test.done();
});

yamlSuite.add('list set pads gaps with null entries', (test) => {
    const doc = Yaml.create(['a']);
    doc.set('3', 'x');
    expectDeep(test, doc.toJS(), ['a', null, null, 'x']);
    test.expect(doc.dump()).equals('- a\n- null\n- null\n- x');
    test.done();
});

yamlSuite.add('single-owner: a node passed to set is cloned', (test) => {
    const doc = Yaml.parse('a:\n  x: 1\n');
    const a = doc.get('a')!;
    doc.set('b', a);
    (a as MapNode).value = { x: 2 };
    expectDeep(test, doc.toJS(), { a: { x: 2 }, b: { x: 1 } });
    test.done();
});

yamlSuite.add('clone deep-copies a node independently', (test) => {
    const doc = Yaml.parse('a:\n  x: 1\n');
    const copy = (doc.get('a') as MapNode).clone();
    (copy as MapNode).value = { x: 9 };
    expectDeep(test, doc.toJS(), { a: { x: 1 } });
    expectDeep(test, copy.toJS(), { x: 9 });
    test.done();
});

// ============ typed accessors and comments ============

yamlSuite.add('getMap/getList/getNumber narrow by kind', (test) => {
    const doc = Yaml.parse('a:\n  b: 1\nc:\n  - x\n');
    test.expect(doc.getMap('a')).instanceOf(MapNode);
    test.expect(doc.getList('c')).instanceOf(ListNode);
    test.expect(doc.getNumber('a.b')).equals(1);
    test.expect(doc.getMap('c')).equals(null);
    test.expect(doc.getList('a')).equals(null);
    test.expect(doc.getNumber('a')).equals(null);
    test.done();
});

yamlSuite.add('comments preserve and attach comment blocks', (test) => {
    const doc = Yaml.parse('# document comment\nserver:\n  # host address\n  host: localhost\n  port: 8080\n');
    expectDeep(test, doc.comments(), { server: 'document comment', 'server.host': 'host address' });
    doc.addCommentBefore('server.port', 'listening port');
    doc.addCommentAfter('server.host', 'domain');
    const dumped = doc.dump();
    test.expect(dumped).includes('# listening port\n  port: 8080');
    test.expect(dumped).includes('host: localhost # domain');
    test.done();
});

// ============ sync ============

yamlSuite.add('sync reconciles maps, lists and scalars preserving untouched formatting', (test) => {
    const doc = Yaml.parse('port: 8080 # HTTP\nhost: localhost\n');
    doc.sync({ port: 9090, host: 'localhost', debug: true });
    expectDeep(test, doc.toJS(), { port: 9090, host: 'localhost', debug: true });
    test.expect(doc.dump()).includes('port: 9090 # HTTP');
    test.expect(doc.dump()).includes('debug: true');
    test.done();
});

yamlSuite.add('sync drops keys and truncates lists', (test) => {
    const doc = Yaml.parse('a: 1\nb: 2\nc: 3\n');
    doc.sync({ a: 1 });
    expectDeep(test, doc.toJS(), { a: 1 });
    test.expect(doc.dump()).equals('a: 1\n');
    const list = Yaml.parse('- a\n- b\n- c\n');
    list.sync(['a', 'c']);
    expectDeep(test, list.toJS(), ['a', 'c']);
    test.done();
});

yamlSuite.add('sync replaces a scalar root with a container', (test) => {
    const doc = Yaml.parse('42\n');
    doc.sync({ x: 1 });
    expectDeep(test, doc.toJS(), { x: 1 });
    test.expect(doc.dump()).equals('x: 1\n');
    test.done();
});

// ============ numeric keys ============

yamlSuite.add('numeric-like map keys round-trip in source order', (test) => {
    const yaml = '2: b\n1: a\n10: c\n';
    const doc = Yaml.parse(yaml);
    test.expect(doc.dump()).equals(yaml);
    expectDeep(test, doc.toJS(), { 2: 'b', 1: 'a', 10: 'c' });
    doc.set('5', 'e');
    // Fresh keys are emitted via minimal quoting; a numeric-looking key stays a string and is quoted for safety.
    test.expect(doc.dump()).equals("2: b\n1: a\n10: c\n'5': e\n");
    test.done();
});

// ============ create / facade ============

yamlSuite.add('create() builds an empty map document', (test) => {
    const doc = Yaml.create();
    expectDeep(test, doc.toJS(), {});
    test.expect(doc.dump()).equals('{}');
    doc.set('x', 1);
    expectDeep(test, doc.toJS(), { x: 1 });
    test.done();
});

yamlSuite.add('create(value) seeds the root', (test) => {
    const list = Yaml.create([1, 2, 3]);
    expectDeep(test, list.toJS(), [1, 2, 3]);
    test.expect(list.dump()).equals('- 1\n- 2\n- 3');
    const scalar = Yaml.create('hello');
    expectDeep(test, scalar.toJS(), 'hello');
    test.expect(scalar.dump()).equals('hello');
    test.done();
});

yamlSuite.add('Yaml facade mirrors Document operations', (test) => {
    const doc = Yaml.parse('a: 1\n');
    test.expect(Yaml.dump(doc)).equals('a: 1\n');
    expectDeep(test, Yaml.toJS(doc), { a: 1 });
    expectDeep(test, Yaml.toJS('a: 1\n'), { a: 1 });
    Yaml.sync(doc, { b: 2 });
    expectDeep(test, doc.toJS(), { b: 2 });
    test.done();
});

// ============ errors ============

yamlSuite.add('duplicated mapping keys throw as syntax errors (not unsupported)', (test) => {
    expectThrow(test, () => Yaml.parse('a: 1\na: 2\n'), /Duplicated mapping key/, false);
    test.done();
});

yamlSuite.add('CRLF input is rejected', (test) => {
    expectThrow(test, () => Yaml.parse('a: 1\r\n'), /CRLF/, true);
    test.done();
});

yamlSuite.add('unsupported features are flagged as unsupported', (test) => {
    expectThrow(test, () => Yaml.parse('%YAML 1.2\n'), /Directives/, true);
    expectThrow(test, () => Yaml.parse('a: &anchor 1\n'), /Anchors/, true);
    expectThrow(test, () => Yaml.parse('a: {b: 1}\n'), /flow collections/, true);
    test.done();
});

// ============ architecture: pipeline over contracts ============

yamlSuite.add('Parser produces a plain IsDocument payload, never classes', (test) => {
    const payload = Parser.parse('a: 1\nb:\n  - x\n');
    test.expect(isDocument(payload)).equals(true);
    test.expect(payload[DOCUMENT]).equals(true);
    test.expect(payload.root instanceof Node).equals(false);
    test.expect(payload.root[NODE]).equals(true);
    test.expect(isMap(payload.root)).equals(true);
    test.expect(isList((payload.root as import('../src/index.js').IsMap).children.b)).equals(true);
    test.expect(isScalar((payload.root as import('../src/index.js').IsMap).children.a)).equals(true);
    test.expect(payload.unit).equals(2);
    test.done();
});

yamlSuite.add('the pipeline works purely on raw contracts (guards, no instanceof)', (test) => {
    const payload = Parser.parse('# header\na: 1 # keep\n');
    test.expect(Serializer.dump(payload)).equals('# header\na: 1 # keep\n');
    const root = Synchronizer.sync(payload, { a: 2 });
    test.expect(root).equals(payload.root); // same-shape map, reconciled in place
    // The inline comment survives the scalar replacement (seating adopts the old entry's metadata).
    test.expect(Serializer.dump(payload)).equals('# header\na: 2 # keep\n');
    test.done();
});

yamlSuite.add('document root is public and pipeline-friendly', (test) => {
    const doc = Yaml.parse('a: 1\n');
    test.expect(doc.root).instanceOf(Node);
    test.expect(doc.root.contract[NODE]).equals(true);
    expectDeep(test, doc.root.toJS(), { a: 1 });
    test.done();
});

yamlSuite.add('YamlError carries no status field (v1 compat dropped)', (test) => {
    const error = new YamlError('boom', { line: 3 });
    test.expect((error as unknown as Record<string, unknown>).status).equals(undefined);
    test.expect(error.line).equals(3);
    test.expect(error.message).includes('line 3');
    test.done();
});

// ============ formatter fidelity (ported from v1) ============

yamlSuite.add('renders modified scalars with minimal quoting', (test) => {
    const doc = Yaml.parse('a: 1\n');
    doc.set('a', 'with spaces here');
    test.expect(doc.dump()).equals('a: with spaces here\n');
    doc.set('a', 'has: colon');
    test.expect(doc.dump()).equals("a: 'has: colon'\n");
    doc.set('a', 'true');
    test.expect(doc.dump()).equals("a: 'true'\n");
    doc.set('a', "#it's");
    test.expect(doc.dump()).equals("a: '#it''s'\n");
    doc.set('a', 'line\nbreak');
    test.expect(doc.dump()).equals('a: "line\\nbreak"\n');
    test.done();
});

yamlSuite.add('renders special numbers in YAML spelling', (test) => {
    const doc = Yaml.parse('a: 1\n');
    doc.set('a', Infinity);
    test.expect(doc.dump()).equals('a: .inf\n');
    doc.set('a', -Infinity);
    test.expect(doc.dump()).equals('a: -.inf\n');
    doc.set('a', NaN);
    test.expect(doc.dump()).equals('a: .nan\n');
    doc.set('a', null);
    test.expect(doc.dump()).equals('a: null\n');
    doc.set('a', true);
    test.expect(doc.dump()).equals('a: true\n');
    test.done();
});

yamlSuite.add('keeps untouched formatting when a sibling changes', (test) => {
    const doc = Yaml.parse('a:      1\nb: 2\n');
    doc.set('b', 3);
    test.expect(doc.dump()).equals('a:      1\nb: 3\n');
    test.done();
});

yamlSuite.add('preserves trailing spaces and inter-comment spacing byte for byte', (test) => {
    const yaml = 'a: 1   \nb:   2  # two   \n';
    test.expect(Yaml.parse(yaml).dump()).equals(yaml);
    test.done();
});

yamlSuite.add('round-trips wrapped entries and block scalars untouched', (test) => {
    const yaml = 'items:\n  - a: 1\n    b: 2\n  - plain\nscript: |\n  line one\n  line two\n';
    test.expect(Yaml.parse(yaml).dump()).equals(yaml);
    test.done();
});

yamlSuite.add('keeps and re-renders empty inline collections', (test) => {
    const yaml = 'a: {}\nb: []\n';
    const doc = Yaml.parse(yaml);
    expectDeep(test, doc.toJS(), { a: {}, b: [] });
    test.expect(doc.dump()).equals(yaml);
    doc.set('b', []);
    test.expect(doc.dump()).equals(yaml);
    test.done();
});

yamlSuite.add('grows an empty inline collection into block form on demand', (test) => {
    const doc = Yaml.parse('a: {}\n');
    doc.set('a.b', 1);
    test.expect(doc.dump()).equals('a:\n  b: 1\n');
    test.done();
});

yamlSuite.add('keys may be plain or quoted', (test) => {
    expectDeep(test, Yaml.parse('plain: 1\n"quoted key": 2\n').toJS(), { plain: 1, 'quoted key': 2 });
    test.done();
});

yamlSuite.add('detects the document indentation unit (doc.unit)', (test) => {
    const doc = Yaml.parse('a:\n    b:\n        c: 1\n');
    test.expect(doc.unit).equals(4);
    test.done();
});

yamlSuite.add('rejects unterminated quoted scalars as unsupported', (test) => {
    expectThrow(test, () => Yaml.parse('a: "unterminated\n'), /Unterminated quoted scalar/, true);
    test.done();
});

yamlSuite.add('rejects unexpected content after the root', (test) => {
    expectThrow(test, () => Yaml.parse('a: 1\nhello\n'), /Unexpected content after document root/, true);
    test.done();
});

// ============ stress ============

yamlSuite.add('stress: edge-case corpus round-trips byte-for-byte', (test) => {
    const corpus: Array<[string, string]> = [
        ['root scalar number', '42\n'],
        ['root scalar string', 'hello world\n'],
        ['root list plain', '- a\n- b\n- c\n'],
        ['root list of maps', '- name: x\n  port: 1\n- 2\n'],
        ['root list of lists', '- - 1\n  - 2\n- - 3\n'],
        ['root empty list', '[]\n'],
        ['root empty map', '{}\n'],
        ['escaped double-quoted key', '"key \\"quoted\\"": 1\n'],
        ["single-quoted key with ''", "'it''s key': 1\n"],
        ['spaces before colon', 'a  : 1\n'],
        ['quoted numeric key', "'5': e\n"],
        ['hash attached to value', 'a: 1#comment\n'],
        ['colon inside plain value', 'a: x:y\n'],
        ['trailing spaces before comment', 'b:   2  # two   \n'],
        ['empty dash entry', 'a:\n- \n'],
        ['non-number hex prefix', 'a: 0xZZ\n'],
        ['exponents and .5', 'a: 1e3\nb: 2.5E-2\nc: .5\n'],
        ['explicit plus number', 'a: +42\n'],
        ['unicode value', 'a: José — café ☕ 日本語\n'],
        ['unicode keys', 'clave: 1\n日本語: 2\n'],
        ['deep nesting', 'a:\n  b:\n    c:\n      d:\n        e:\n          f:\n            g: 1\n'],
        ['header blanks and comments', '\n# one\n\n# two\na: 1\n'],
        ['footer blanks and comments', 'a: 1\n\n# after\n\n'],
        ['comment-only document', '# just a comment\n'],
        ['blank lines inside list', '- a\n\n- b\n'],
        ['inline comment spacing', 'a: 1    # x\n'],
        ['block literal and folded', 'a: |\n  one\n  two\nb: >\n  one\n  two\n'],
        ['block chomping', 'a: |-\n  x\nb: |+\n  y\n\n'],
        ['block with inner blanks', 'a: |\n  x\n\n  y\n'],
        ['standalone block', '|\n  x\n  y\n'],
        ['double-quoted escapes', 'a: "\\t\\n\\\\\\"\\u00e9"\n'],
        ['empty double-quoted', 'a: ""\n'],
        ["empty single-quoted", "a: ''\n"],
        ['single containing double', "a: 'say \"hi\"'\n"],
        ['multiword plain', 'a: some words here\n'],
        ['tabular inline key', 'a:\n\tb: 1\n'],
        ['wide flat map', Array.from({ length: 300 }, (_, i) => `key${i}: value${i}`).join('\n') + '\n'],
    ];
    for (const [name, input] of corpus) {
        const output = Yaml.parse(input).dump();
        test.expect(output, name).equals(input);
    }
    test.done();
});

yamlSuite.add('stress: repeated edits keep dump a fixed point and data intact', (test) => {
    const doc = Yaml.parse('# header\na: 1 # keep\nb:\n  c: hello\n  d:\n    - 1\n    - 2\n');
    const ops: Array<() => void> = [
        () => doc.set('b.c', 'changed'),
        () => doc.set('b.d.1', 99),
        () => doc.delete('a'),
        () => doc.set('e.f.g', { x: [1, { y: 2 }] }),
        () => { (doc.get('b') as MapNode).value = { c: 'rebuilt', z: true }; },
        () => doc.addCommentBefore('e.f', 'deep comment'),
        () => doc.addCommentAfter('b.c', 'inline note'),
        () => doc.set('list0', [1, 2, 3]),
        () => doc.set('nested.deep.path.walk', 7),
        () => { (doc.get('b.c') as ScalarNode).value = 'via value'; },
    ];
    for (let i = 0; i < ops.length; i++) {
        ops[i]();
        const dumped = doc.dump();
        const rep = Yaml.parse(dumped);
        test.expect(rep.dump(), `op ${i}: dump must be a fixed point`).equals(dumped);
        expectDeep(test, rep.toJS(), doc.toJS(), `op ${i}: reparse data must match`);
    }
    test.done();
});

yamlSuite.add('stress: seeded fuzz keeps the document consistent under 300 random edits', (test) => {
    const mulberry32 = (seed: number): () => number => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const rand = mulberry32(20260919);
    const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const strings = ['alpha', 'with spaces', "it's", 'say "hi"', 'true', 'null', '42', '3.14', 'has: colon', '#hash', 'line\nbreak', 'café ☕ 日本語', '', 'x'.repeat(80)];
    const scalar = (): string | number | boolean | null => {
        switch (Math.floor(rand() * 5)) {
            case 0: return pick(strings);
            case 1: return Math.floor(rand() * 200000) - 100000;
            case 2: return pick([0.5, 1.5, 3.14, -2.75, 100.25, 0.125, 1e6, -1e-3]);
            case 3: return rand() < 0.5;
            default: return null;
        }
    };
    const value = (): JsonValue => {
        const kind = Math.floor(rand() * 6);
        if (kind === 4) return { x: scalar(), y: scalar() };
        if (kind === 5) return [scalar(), scalar()];
        return scalar();
    };

    const fixture = `# Top comment\napiVersion: v1\nkind: ConfigMap\ndata:\n  # database settings\n  db:\n    host: localhost # primary\n    port: 5432\n    extra:\n      - a\n      - b\nlabels:\n  app: demo\n  tier:\n    - web\n    - api\nscalars:\n  plain: hello world\n  quoted: "say \\"hi\\""\n  single: it''s\n  empty: ""\n  bool: true\n  nil: null\n  num: 42\n  float: 3.14\n  hex: 0x1F\nblock: |\n  line one\n  line two\n`;
    const doc = Yaml.parse(fixture);
    test.expect(doc.dump(), 'fixture must be byte-perfect').equals(fixture);

    const paths = ['apiVersion', 'kind', 'data', 'data.db', 'data.db.host', 'data.db.port', 'data.db.extra', 'labels', 'labels.app', 'labels.tier', 'scalars', 'scalars.plain', 'scalars.quoted', 'scalars.single', 'scalars.empty', 'scalars.bool', 'scalars.nil', 'scalars.num', 'scalars.float', 'scalars.hex', 'block'];
    const scalarPaths = ['apiVersion', 'kind', 'data.db.host', 'data.db.port', 'scalars.plain', 'scalars.quoted', 'scalars.single', 'scalars.empty', 'scalars.bool', 'scalars.nil', 'scalars.num', 'scalars.float', 'scalars.hex', 'block'];
    const types: NodeType[] = ['string', 'number', 'boolean', 'map', 'list'];
    const fresh = ['fresh.one', 'fresh.two.deep', 'fresh.three'];

    const stable = (tag: string): void => {
        const dumped = doc.dump();
        const rep = Yaml.parse(dumped);
        test.expect(rep.dump(), `${tag}: dump must be a fixed point`).equals(dumped);
        expectDeep(test, rep.toJS(), doc.toJS(), `${tag}: reparse data must match`);
    };

    stable('initial');
    for (let op = 0; op < 300; op++) {
        const roll = rand();
        let path = pick(paths);
        if (rand() < 0.2) path += `.${pick(fresh)}`;
        if (roll < 0.4) {
            if (doc.get(path)) doc.set(path, value());
        } else if (roll < 0.55) {
            if (doc.get(path)) {
                try {
                    doc.set(path, value(), pick(types));
                } catch (error) {
                    test.expect(error, `op ${op}: type mismatch must be YamlError`).instanceOf(YamlError);
                }
            }
        } else if (roll < 0.65) {
            doc.delete(path);
        } else if (roll < 0.8) {
            const node = doc.get(pick(scalarPaths));
            if (node && isScalar(node.contract)) (node as ScalarNode).value = scalar();
        } else if (roll < 0.9) {
            if (doc.get(path)) {
                doc.addCommentBefore(path, 'fuzz note');
                doc.addCommentAfter(path, 'note');
            }
        } else {
            doc.sync({ apiVersion: scalar(), fresh: value() });
        }
        if (op % 25 === 24) stable(`after ${op + 1} ops`);
    }
    stable('final');
    test.done();
});

yamlSuite.add('stress: deep auto-creation, wide maps and padded lists survive round-trip', (test) => {
    const deep = Yaml.create();
    for (let i = 0; i < 20; i++) deep.set(Array.from({ length: i + 1 }, (_, k) => `k${k}`).join('.'), i);
    const deepDump = deep.dump();
    expectDeep(test, Yaml.parse(deepDump).toJS(), deep.toJS());
    test.expect(Yaml.parse(deepDump).dump()).equals(deepDump);

    const wide = Yaml.create();
    for (let i = 0; i < 300; i++) wide.set(`key${i}`, i % 3 === 0 ? { x: i } : i % 3 === 1 ? [i] : `v${i}`);
    const wideDump = wide.dump();
    expectDeep(test, Yaml.parse(wideDump).toJS(), wide.toJS());
    test.expect(Yaml.parse(wideDump).dump()).equals(wideDump);

    const padded = Yaml.create(['a']);
    padded.set('100', 'x');
    expectDeep(test, padded.toJS(), Array.from({ length: 101 }, (_, i) => (i === 0 ? 'a' : i === 100 ? 'x' : null)));
    const padDump = padded.dump();
    expectDeep(test, Yaml.parse(padDump).toJS(), padded.toJS());
    test.expect(Yaml.parse(padDump).dump()).equals(padDump);
    test.done();
});

yamlSuite.add('stress: sync preserves untouched comments and is idempotent', (test) => {
    const doc = Yaml.parse('# service config\nserver:\n  host: localhost # DNS\n  port: 8080 # HTTP\n  region: eu-west # zone\n');
    const data = { server: { host: 'example.com', port: 9090, region: 'eu-west' } };
    doc.sync(data);
    const once = doc.dump();
    test.expect(once).includes('host: example.com # DNS');
    test.expect(once).includes('port: 9090 # HTTP');
    test.expect(once).includes('region: eu-west # zone');
    doc.sync(data);
    test.expect(doc.dump()).equals(once);
    test.done();
});

yamlSuite.add('stress: wrapper identity is stable across reads, mutations and sync', (test) => {
    const doc = Yaml.parse('a:\n  b: 1\n  keep: x\n');
    const a1 = doc.get('a');
    const b1 = doc.get('a.b');
    const keep1 = doc.get('a.keep');
    doc.set('a.b', 2);
    test.expect(doc.get('a')).equals(a1);
    test.expect(doc.get('a.b')).equals(b1);
    doc.set('c', { d: 1 });
    test.expect(doc.get('c')).equals(doc.get('c'));
    doc.sync({ a: { b: 3, keep: 'x' } });
    test.expect(doc.get('a')).equals(a1);
    test.expect(doc.get('a.keep')).equals(keep1);
    test.expect(doc.get('a.b')).notEquals(b1);
    expectDeep(test, doc.toJS(), { a: { b: 3, keep: 'x' } });
    test.done();
});

yamlSuite.add('stress: empty and header-only documents round-trip exactly', (test) => {
    const cases = ['', '\n', '# just a comment\n', '# a\n\n# b\n', '---\n', '# h\n\n', '- \n'];
    for (const input of cases) {
        test.expect(Yaml.parse(input).dump(), JSON.stringify(input)).equals(input);
    }
    test.done();
});

yamlSuite.add('stress: hostile inputs never crash — YamlError or byte-perfect round-trip', (test) => {
    const hostile = [
        '%YAML 1.2\n',
        '---\na: 1\n---\nb: 2\n',
        'a: &x 1\n',
        'a: !tag 1\n',
        'a: {b: 1}\n',
        'a: 1\r\n',
        'a: "unterminated\n',
        'a: 1\nhello\n',
        'a:\n  b: 1\n x\n',
        ':\n',
        'a:\n  - 1\n  b: 2\n',
        `k: ${'x'.repeat(100_000)}\n`,
        'a:\n' + Array.from({ length: 199 }, (_, i) => `${' '.repeat(i + 1)}k${i}: 1\n`).join(''),
    ];
    for (const input of hostile) {
        try {
            const output = Yaml.parse(input).dump();
            test.expect(Yaml.parse(output).dump(), `re-parse of [${input.slice(0, 16)}]`).equals(output);
        } catch (error) {
            test.expect(error, `throw for [${input.slice(0, 16)}]`).instanceOf(YamlError);
        }
    }
    test.done();
});

yamlSuite.add('stress: branch edits via node.set stay consistent with the document', (test) => {
    const doc = Yaml.parse('a:\n    b: 1\n');
    const a = doc.getMap('a')!;
    a.set('c.d', 2);
    expectDeep(test, doc.toJS(), { a: { b: 1, c: { d: 2 } } });
    test.expect(doc.unit).equals(4);
    const dump = doc.dump();
    expectDeep(test, Yaml.parse(dump).toJS(), doc.toJS());
    test.expect(Yaml.parse(dump).dump()).equals(dump);
    test.done();
});

yamlSuite.add('stress: inline comments survive replacing a scalar with a container', (test) => {
    // A replaced scalar keeps its inline comment: the comment moves above the entry when the new
    // value spans child lines, and stays inline for empty collections.
    const doc = Yaml.parse('server:\n  host: localhost # DNS\n  port: 8080\n');
    doc.set('server.host', { address: 'x', zone: 'eu' });
    const dumped = doc.dump();
    test.expect(dumped).includes('# DNS\n  host:');
    test.expect(Yaml.parse(dumped).dump()).equals(dumped);
    expectDeep(test, Yaml.parse(dumped).toJS(), { server: { host: { address: 'x', zone: 'eu' }, port: 8080 } });

    const empty = Yaml.parse('a: 1 # keep\n');
    empty.set('a', {});
    test.expect(empty.dump()).equals('a: {} # keep\n');

    const grown = Yaml.parse('a: {} # keep\n');
    grown.set('a.b', 1);
    const grownDump = grown.dump();
    test.expect(grownDump).includes('# keep\na:');
    test.expect(Yaml.parse(grownDump).dump()).equals(grownDump);
    expectDeep(test, Yaml.parse(grownDump).toJS(), { a: { b: 1 } });
    test.done();
});

yamlSuite.add('stress: sync kind replacements keep indentation and round-trip', (test) => {
    const cases: Array<[string, string, JsonValue]> = [
        ['list -> map at key', 'a:\n  - x\n  - y\n', { a: { p: 1, q: 2 } }],
        ['map value -> list', 'a:\n  b: 1\n', { a: { b: [1, 2] } }],
        ['list item -> map', 'spec:\n  items:\n    - 1\n', { spec: { items: [{ x: 1 }] } }],
        ['list item -> list', 'spec:\n  items:\n    - 1\n', { spec: { items: [['a'], ['b']] } }],
    ];
    for (const [name, source, data] of cases) {
        const doc = Yaml.parse(source);
        doc.sync(data);
        const dumped = doc.dump();
        test.expect(Yaml.parse(dumped).dump(), `${name}: fixed point`).equals(dumped);
        expectDeep(test, Yaml.parse(dumped).toJS(), data, `${name}: data`);
    }
    test.done();
});