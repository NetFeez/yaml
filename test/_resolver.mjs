const PREFIX = '@TestSuite/';
const BASE = new URL('../dist-test/test/TestSuite/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(PREFIX)) {
        const file = specifier.slice(PREFIX.length).replace(/\.ts$/, '') + '.js';
        return { url: new URL(file, BASE).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}