import TestSuite from '@TestSuite/TestSuite';

import { Compiler } from '../src/Compiler.js';
import { AST, Node, MapNode, ListNode, ScalarNode } from '../src/AST.js';
import YamlError from '../src/YamlError.js';
import { expectDeep } from './utils.js';

export const astSuite = new TestSuite('ast');

astSuite.add('subtree builds plain values into typed nodes', (test) => {
    const scalar = AST.subtree(42, '', '', 2, false);
    test.expect(scalar).instanceOf(ScalarNode);
    test.expect((scalar as ScalarNode).value).equals(42);

    const list = AST.subtree([1, 2], '', '', 2, false);
    test.expect(list).instanceOf(ListNode);
    test.expect((list as ListNode).items.length).equals(2);

    const map = AST.subtree({ a: 1 }, '', '', 2, false);
    test.expect(map).instanceOf(MapNode);
    test.expect((map as MapNode).items[0].key).equals('a');
    test.done();
});

astSuite.add('get traverses maps, lists and dot paths', (test) => {
    const doc = Compiler.parse('server:\n  host: localhost\n  ports:\n    - 8080\n    - 9090\n');
    const host = doc.get('server.host');
    test.expect(host).instanceOf(ScalarNode);
    test.expect((host as ScalarNode).value).equals('localhost');
    test.expect((doc.get('server.ports.1') as ScalarNode).value).equals(9090);
    test.expect(doc.get('server.missing')).equals(null);
    test.expect(doc.get('server.ports.9')).equals(null);
    test.done();
});

astSuite.add('set creates intermediate containers on demand', (test) => {
    const doc = Compiler.parse('a: 1\n');
    doc.set('c.d', [1, 2, 3]);
    expectDeep(test, Compiler.compile(doc), { a: 1, c: { d: [1, 2, 3] } });
    test.done();
});

astSuite.add('set pads list gaps with null entries', (test) => {
    const doc = Compiler.parse('items:\n  - a\n  - b\n');
    doc.set('items.3', 'd');
    expectDeep(test, Compiler.compile(doc), { items: ['a', 'b', null, 'd'] });
    test.done();
});

astSuite.add('set updates a compatible scalar in place, preserving style metadata', (test) => {
    const doc = Compiler.parse("greeting: 'hi'\n");
    doc.set('greeting', 'bye');
    test.expect((doc.get('greeting') as ScalarNode).style).equals('single');
    test.expect(Compiler.dump(doc)).equals('greeting: bye\n');
    test.done();
});

astSuite.add('delete removes exactly one node without garbage-collecting parents', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\n  c: 2\nd: 3\n');
    test.expect(doc.delete('a.b')).equals(true);
    test.expect(Compiler.dump(doc)).equals('a:\n  c: 2\nd: 3\n');
    test.expect(doc.delete('a.missing')).equals(false);
    test.expect(doc.delete('a')).equals(true);
    test.done();
});

astSuite.add('getMap, getList and getNumber return typed values or null', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\nc:\n  - x\nd: 2\n');
    test.expect(doc.getMap('a')).instanceOf(MapNode);
    test.expect(doc.getMap('d')).equals(null);
    test.expect(doc.getList('c')).instanceOf(ListNode);
    test.expect(doc.getList('a')).equals(null);
    test.expect(doc.getNumber('d')).equals(2);
    test.expect(doc.getNumber('a')).equals(null);
    test.expect(doc.getNumber('missing')).equals(null);
    test.done();
});

astSuite.add('set validates an explicit type and throws on mismatch', (test) => {
    const doc = Compiler.parse('a: 1\n');
    doc.set('b', { nested: true }, 'map');
    test.expect(doc.getMap('b')).instanceOf(MapNode);
    doc.set('c', 5, 'number');
    test.expect(doc.getNumber('c')).equals(5);
    doc.set('d', 'plain', 'string');
    test.expect((doc.get('d') as ScalarNode).value).equals('plain');
    try {
        doc.set('e', 5, 'string');
        throw new Error('expected set to throw');
    } catch (error) {
        test.expect(error).instanceOf(YamlError);
    }
    test.expect(doc.get('e')).equals(null);
    test.done();
});

astSuite.add('lead attaches an auto-indented comment above a field', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\n');
    doc.addLead('a.b', 'over b');
    test.expect(Compiler.dump(doc)).equals('a:\n  # over b\n  b: 1\n');
    test.done();
});

astSuite.add('lead supports autoIndent=false and raw comment lines', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\n');
    doc.addLead('a.b', 'no indent', false);
    test.expect(Compiler.dump(doc)).equals('a:\n# no indent\n  b: 1\n');
    doc.addLead('a.b', '## style');
    test.expect(Compiler.dump(doc)).equals('a:\n# no indent\n  ## style\n  b: 1\n');
    test.done();
});

astSuite.add('lead works on list items', (test) => {
    const doc = Compiler.parse('items:\n  - one\n');
    doc.addLead('items.0', 'first');
    test.expect(Compiler.dump(doc)).equals('items:\n  # first\n  - one\n');
    test.done();
});

astSuite.add('inline attaches a trailing comment to the value line', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\n');
    doc.addInline('a.b', 'beside');
    test.expect(Compiler.dump(doc)).equals('a:\n  b: 1 # beside\n');
    test.done();
});

astSuite.add('lead and inline throw on unknown paths', (test) => {
    const doc = Compiler.parse('a: 1\n');
    for (const call of [() => doc.addLead('a.b', 'x'), () => doc.addInline('nope', 'x')]) {
        try {
            call();
            throw new Error('expected comment mutation to throw');
        } catch (error) {
            test.expect(error).instanceOf(YamlError);
        }
    }
    test.done();
});

astSuite.add('entries expose their metadata for direct comment mutation', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\n');
    const entry = doc.get('a.b');
    test.expect(entry).notEquals(null);
    (entry as ScalarNode).lead.push('  # raw lead');
    test.expect(Compiler.dump(doc)).equals('a:\n  # raw lead\n  b: 1\n');
    test.expect(doc.get('a.missing')).equals(null);
    test.done();
});

astSuite.add('set clones node values so subtrees stay single-owner', (test) => {
    const docA = Compiler.parse('a:\n  x: 1\n');
    const docB = Compiler.parse('b: 2\n');
    docB.set('b', docA.get('a')!);
    docA.set('a.x', 99);
    expectDeep(test, Compiler.compile(docB), { b: { x: 1 } });
    expectDeep(test, Compiler.compile(docA), { a: { x: 99 } });
    test.expect(Compiler.dump(docB)).equals('b:\n  x: 1\n');
    test.done();
});

astSuite.add('set with a node value onto a new key re-indents the clone', (test) => {
    const docA = Compiler.parse('a:\n  x: 1\n');
    const docB = Compiler.parse('b: 2\n');
    docB.set('d', docA.get('a')!);
    test.expect(Compiler.dump(docB)).equals('b: 2\nd:\n  x: 1\n');
    test.done();
});

astSuite.add('set with a node value into a list index resets entry identity', (test) => {
    const docA = Compiler.parse('a:\n  x: 1\n');
    const docB = Compiler.parse('list:\n  - old\n');
    docB.set('list.1', docA.get('a')!);
    test.expect(Compiler.dump(docB)).equals('list:\n  - old\n  -\n    x: 1\n');
    expectDeep(test, Compiler.compile(docB), { list: ['old', { x: 1 }] });
    test.done();
});

astSuite.add('set with a scalar node value renders its value', (test) => {
    const docA = Compiler.parse('a: 1\n');
    const docB = Compiler.parse('list:\n  - old\n');
    docB.set('list.1', docA.get('a')!);
    test.expect(Compiler.dump(docB)).equals('list:\n  - old\n  - 1\n');
    test.done();
});

astSuite.add('moved nodes carry their comments', (test) => {
    const docA = Compiler.parse('# lead\na: 1 # note\n');
    const docB = Compiler.parse('b: 2\n');
    docB.set('c', docA.get('a')!);
    test.expect(Compiler.dump(docB)).equals('b: 2\n# lead\nc: 1 # note\n');
    test.done();
});

astSuite.add('getValue reads scalar, container and document values', (test) => {
    const doc = Compiler.parse('server:\n  host: localhost\n  ports:\n    - 8080\n');
    test.expect(doc.get('server.host')!.value).equals('localhost');
    test.expect(doc.get('server.ports.0')!.value).equals(8080);
    expectDeep(test, doc.get('server.ports')!.value, [8080]);
    expectDeep(test, doc.get('server')!.value, { host: 'localhost', ports: [8080] });
    expectDeep(test, doc.value, { server: { host: 'localhost', ports: [8080] } });
    test.done();
});

astSuite.add('setValue updates a scalar in place preserving style', (test) => {
    const doc = Compiler.parse("greeting: 'hi'\n");
    doc.get('greeting')!.value = 'bye';
    test.expect((doc.get('greeting') as ScalarNode).style).equals('single');
    test.expect(Compiler.dump(doc)).equals('greeting: bye\n');
    test.done();
});

astSuite.add('setValue replaces container content keeping the entry identity', (test) => {
    const doc = Compiler.parse('a:\n  b: 1\n  c: 2\n');
    doc.get('a')!.value = { x: 10, y: [1, 2] };
    expectDeep(test, doc.value, { a: { x: 10, y: [1, 2] } });
    test.expect(Compiler.dump(doc)).equals('a:\n  x: 10\n  y:\n    - 1\n    - 2\n');
    test.done();
});

astSuite.add('setValue replaces document content', (test) => {
    const doc = Compiler.parse('# top\n\n# doc\na: 1\n');
    doc.value = { fresh: true };
    expectDeep(test, doc.value, { fresh: true });
    test.expect(Compiler.dump(doc)).equals('# top\n\nfresh: true\n');
    test.done();
});

astSuite.add('setValue throws on incompatible shapes without writing', (test) => {
    const doc = Compiler.parse('a: 1\nb:\n  c: 2\nd:\n  - 1\n');
    const attempts: [Node, AST.JsonValue][] = [
        [doc.get('a')!, { x: 1 }],
        [doc.get('b')!, 5],
        [doc.get('d')!, { x: 1 }],
    ];
    for (const [node, value] of attempts) {
        try {
            node.value = value;
            throw new Error('expected setValue to throw');
        } catch (error) {
            test.expect(error).instanceOf(YamlError);
        }
    }
    expectDeep(test, doc.value, { a: 1, b: { c: 2 }, d: [1] });
    test.done();
});

astSuite.add('inserts into single-entry wrapped containers at the derived indent', (test) => {
    const doc = Compiler.parse('items:\n  - a: 1\n');
    doc.set('items.0.b', 2);
    test.expect(Compiler.dump(doc)).equals('items:\n  - a: 1\n    b: 2\n');
    test.done();
});

astSuite.add('lead reaches entries inside wrapped list items', (test) => {
    const doc = Compiler.parse('items:\n  - a: 1\n    b: 2\n');
    doc.addLead('items.0.b', 'note');
    test.expect(Compiler.dump(doc)).equals('items:\n  - a: 1\n    # note\n    b: 2\n');
    test.done();
});