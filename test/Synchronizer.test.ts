import TestSuite from '@TestSuite/TestSuite';
import { Compiler } from '../src/Compiler.js';
import { expectDeep } from './utils.js';

export const synchronizerSuite = new TestSuite('synchronizer');

synchronizerSuite.add('adds, updates and drops map keys preserving formatting', (test) => {
    const yaml = 'a: 1\nb: 2\nc:\n  keep: yes\n';
    const doc = Compiler.parse(yaml);
    Compiler.apply(doc, { a: 1, b: 20, d: true, c: { keep: 'yes' } });
    expectDeep(test, Compiler.compile(doc), { a: 1, b: 20, d: true, c: { keep: 'yes' } });
    const out = Compiler.dump(doc);
    test.expect(out).includes('a: 1');
    test.expect(out).includes('c:\n  keep: yes');
    test.expect(out).includes('d: true');
    test.done();
});

synchronizerSuite.add('drops keys absent from the target', (test) => {
    const doc = Compiler.parse('a: 1\nb: 2\nc: 3\n');
    Compiler.apply(doc, { b: 20 });
    expectDeep(test, Compiler.compile(doc), { b: 20 });
    test.done();
});

synchronizerSuite.add('synchronizes lists by index, truncating and extending', (test) => {
    const doc = Compiler.parse('items:\n  - one\n  - two\n');
    Compiler.apply(doc, { items: ['one', 'TWO', 'three'] });
    expectDeep(test, Compiler.compile(doc), { items: ['one', 'TWO', 'three'] });
    test.expect(Compiler.dump(doc)).equals('items:\n  - one\n  - TWO\n  - three\n');
    Compiler.apply(doc, { items: ['one'] });
    expectDeep(test, Compiler.compile(doc), { items: ['one'] });
    test.done();
});

synchronizerSuite.add('replaces containers when the shape changes', (test) => {
    const doc = Compiler.parse('value: 1\n');
    Compiler.apply(doc, { value: { nested: true } });
    expectDeep(test, Compiler.compile(doc), { value: { nested: true } });
    Compiler.apply(doc, { value: [1, 2] });
    expectDeep(test, Compiler.compile(doc), { value: [1, 2] });
    Compiler.apply(doc, { value: null });
    expectDeep(test, Compiler.compile(doc), { value: null });
    test.done();
});

synchronizerSuite.add('builds a root when the document is empty', (test) => {
    const doc = Compiler.parse('# empty\n');
    Compiler.apply(doc, { x: 1 });
    expectDeep(test, Compiler.compile(doc), { x: 1 });
    test.done();
});