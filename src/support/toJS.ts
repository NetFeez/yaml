/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Projection of a contract subtree to plain JSON-compatible data. Maps iterate their `keys` so the
 * output object is assembled in source order; scalars pass their primitive through.
 * @license Apache-2.0
 */

import { IsNode, JsonValue, isScalar, isMap, isList } from '../ast/Contracts.js';

/**
 * Projects a contract subtree to plain JSON-compatible data. Maps iterate their `keys` so the output object is assembled in source order; scalars pass their primitive through.
 * @param node - The contract node to project.
 * @returns A plain JSON-compatible value (object, array, string, number, boolean or null).
 * @throws If the input is not a scalar, map or list contract node.
 */
export function toJS(node: IsNode): JsonValue {
    if (isScalar(node)) return node.value;
    if (isMap(node)) {
        const out: { [key: string]: JsonValue } = {};
        for (const key of node.keys) out[key] = toJS(node.children[key]);
        return out;
    }
    if (isList(node)) return node.children.map(child => toJS(child));
    throw new Error(`Unexpected node type. accepted: scalar, map, list. received: ${node}`);
}

export default toJS;