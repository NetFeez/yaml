import TestSuite from '@TestSuite/TestSuite';
import { Compiler } from '../src/Compiler.js';

export const serializerSuite = new TestSuite('serializer');

serializerSuite.add('round-trips an untouched document byte for byte', (test) => {
    const yaml = '# service\nserver:\n  host: localhost   # inline\n  ports:\n    - 8080\n    - 9090\n\n# footer\n';
    test.expect(Compiler.dump(Compiler.parse(yaml))).equals(yaml);
    test.done();
});

serializerSuite.add('keeps untouched formatting when a sibling changes', (test) => {
    const doc = Compiler.parse('a:      1\nb: 2\n');
    doc.set('b', 3);
    test.expect(Compiler.dump(doc)).equals('a:      1\nb: 3\n');
    test.done();
});

serializerSuite.add('renders modified scalars with minimal quoting', (test) => {
    const doc = Compiler.parse('a: 1\n');
    doc.set('a', 'with spaces here');
    test.expect(Compiler.dump(doc)).equals('a: with spaces here\n');
    doc.set('a', 'has: colon');
    test.expect(Compiler.dump(doc)).equals("a: 'has: colon'\n");
    doc.set('a', 'true');
    test.expect(Compiler.dump(doc)).equals("a: 'true'\n");
    doc.set('a', "#it's");
    test.expect(Compiler.dump(doc)).equals("a: '#it''s'\n");
    doc.set('a', 'line\nbreak');
    test.expect(Compiler.dump(doc)).equals('a: "line\\nbreak"\n');
    test.done();
});

serializerSuite.add('renders special numbers in YAML spelling', (test) => {
    const doc = Compiler.parse('a: 1\n');
    doc.set('a', Infinity);
    test.expect(Compiler.dump(doc)).equals('a: .inf\n');
    doc.set('a', -Infinity);
    test.expect(Compiler.dump(doc)).equals('a: -.inf\n');
    doc.set('a', NaN);
    test.expect(Compiler.dump(doc)).equals('a: .nan\n');
    doc.set('a', null);
    test.expect(Compiler.dump(doc)).equals('a: null\n');
    doc.set('a', true);
    test.expect(Compiler.dump(doc)).equals('a: true\n');
    test.done();
});

serializerSuite.add('preserves and re-renders empty inline collections', (test) => {
    const yaml = 'a: {}\nb: []\n';
    const doc = Compiler.parse(yaml);
    test.expect(Compiler.dump(doc)).equals(yaml);
    doc.set('b', []);
    test.expect(Compiler.dump(doc)).equals('a: {}\nb: []\n');
    test.done();
});

serializerSuite.add('preserves trailing spaces and inter-comment spacing byte for byte', (test) => {
    const yaml = 'a: 1   \nb:   2  # two   \n';
    test.expect(Compiler.dump(Compiler.parse(yaml))).equals(yaml);
    test.done();
});

serializerSuite.add('round-trips wrapped entries and block scalars untouched', (test) => {
    const yaml = 'items:\n  - a: 1\n    b: 2\n  - plain\nscript: |\n  line one\n  line two\n';
    test.expect(Compiler.dump(Compiler.parse(yaml))).equals(yaml);
    test.done();
});

serializerSuite.add('grows an empty inline collection into block form on demand', (test) => {
    const doc = Compiler.parse('a: {}\n');
    doc.set('a.b', 1);
    test.expect(Compiler.dump(doc)).equals('a:\n  b: 1\n');
    test.done();
});