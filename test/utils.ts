/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Shared test helpers: structural equality (`deepEqual`) and the deep expectation helper (`expectDeep`).
 * @license Apache-2.0
 */

import TestContext from '@TestSuite/TestContext';

/**
 * Structural equality for JSON-compatible primitives, arrays and plain objects.
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 * @returns Whether both values are structurally equal.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((value, index) => deepEqual(value, (b as unknown[])[index]));
    }
    if (Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * Throws when `actual` is not structurally equal to `expected`.
 * @param test - The test context, kept for parity with the assertion API (not used).
 * @param actual - The received value.
 * @param expected - The expected value.
 * @param description - An optional label included in the error message.
 * @throws If the values are not structurally equal.
 */
export function expectDeep(test: TestContext, actual: unknown, expected: unknown, description?: string): void {
    if (!deepEqual(actual, expected)) {
        const prefix = description ? `(${description}) ` : '';
        throw new Error(`${prefix}expected deep equality but received [${JSON.stringify(actual)}]`);
    }
}