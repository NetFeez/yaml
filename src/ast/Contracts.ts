/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Structural contracts for the YAML node kinds, discriminated by `Symbol.for` brands, plus brand guards and the pipeline helpers (`orderedChildren`, `matchesType`).
 * The pipeline (Parser, toJS, Serializer, Synchronizer, Pathing) works exclusively against these shapes, never against concrete classes, so no circular dependency can form.
 * @license Apache-2.0
 */

//
// ========== Discrimination symbols ==========
//

/** Marks an object as a generic AST node. */
export const NODE = Symbol.for('yaml.node');
/** Marks a node as a mapping. */
export const MAP = Symbol.for('yaml.map');
/** Marks a node as a sequence. */
export const LIST = Symbol.for('yaml.list');
/** Marks a node as a scalar (leaf) holding a primitive value. */
export const SCALAR = Symbol.for('yaml.scalar');
/** Marks an object as a document payload. */
export const DOCUMENT = Symbol.for('yaml.document');

//
// ========== Shared types ==========
//

/** Plain JS value the document model can represent. Accepts Infinity/NaN (via `.inf`/`.nan`). */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Primitive kinds a scalar leaf can hold (scalars are never containers). */
export type Primitive = null | boolean | number | string;

/** Value-kind names accepted by `set(path, value, type)` validation. */
export type NodeType = 'map' | 'list' | 'string' | 'number' | 'boolean' | 'null';

/** Source formatting metadata of a node's own entry line. `dirty` is the single invalidation flag. */
export interface Metadata {
    dirty: boolean;
    lead: string[];
    prefix: string;
    token: string;
    sep: string;
    rest: string;
    inline: string | null;
    wrapped: boolean;
    key: string;
}

//
// ========== Node contracts ==========
//

/** Shared contract of every AST node: entry metadata plus its kind-specific content. */
export interface IsNode {
    readonly [NODE]: true;
    meta: Metadata;
}

/** Contract of a scalar (leaf) node: the primitive `value` and its scalar formatting. */
export interface IsScalar extends IsNode {
    readonly [SCALAR]: true;
    value: Primitive;
    style: IsScalar.Style;
    chomp: IsScalar.Chomp;
    body: string[];
}

export namespace IsScalar {
    export type Style = 'plain' | 'single' | 'double' | 'literal' | 'folded';
    export type Chomp = '-' | '+' | null;
}

/** Contract of a mapping node: ordered keys plus the keyed child branches. */
export interface IsMap extends IsNode {
    readonly [MAP]: true;
    children: { [key: string]: IsNode };
    keys: string[];
}

/** Contract of a sequence node: the ordered child branches. */
export interface IsList extends IsNode {
    readonly [LIST]: true;
    children: IsNode[];
}

/** Contract of a document payload: indentation unit, raw header/footer lines and the root branch. */
export interface IsDocument {
    readonly [DOCUMENT]: true;
    unit: number;
    header: string[];
    root: IsNode;
    footer: string[];
}

//
// ========== Type guards (duck-typing, cross-copy/cross-realm safe via Symbol.for) ==========
//

/** Brand guard: whether the value is a generic AST node. */
export function isNode(value: unknown): value is IsNode {
    return typeof value === 'object' && value !== null && Reflect.get(value, NODE) === true;
}

/** Brand guard: whether the value is a scalar (leaf) node. */
export function isScalar(value: unknown): value is IsScalar {
    return isNode(value) && Reflect.get(value, SCALAR) === true;
}

/** Brand guard: whether the value is a mapping node. */
export function isMap(value: unknown): value is IsMap {
    return isNode(value) && Reflect.get(value, MAP) === true;
}

/** Brand guard: whether the value is a sequence node. */
export function isList(value: unknown): value is IsList {
    return isNode(value) && Reflect.get(value, LIST) === true;
}

/** Brand guard: whether the value is a document payload. */
export function isDocument(value: unknown): value is IsDocument {
    return typeof value === 'object' && value !== null && Reflect.get(value, DOCUMENT) === true;
}

/** Container guard: a node is a branch when it is a map or a list. */
export function isContainer(value: unknown): value is IsMap | IsList {
    return isMap(value) || isList(value);
}

/** Reads the children of a container in source order (maps iterate `keys`, lists their array). */
export function orderedChildren(container: IsMap | IsList): IsNode[] {
    if (isMap(container)) {
        const out: IsNode[] = [];
        for (const key of container.keys) {
            const child = container.children[key];
            if (child) out.push(child);
        }
        return out;
    }
    return container.children;
}

/**
 * Verifies that a node matches the requested explicit `type`; unknown kinds pass (permissive mode).
 * @param node - The node to validate.
 * @param type - The explicit kind required, or an unrecognized name for permissive mode.
 * @returns Whether the node matches the requested kind.
 */
export function matchesType(node: IsNode, type: NodeType): boolean {
    switch (type) {
        case 'map': return isMap(node);
        case 'list': return isList(node);
        case 'string': return isScalar(node) && typeof node.value === 'string';
        case 'number': return isScalar(node) && typeof node.value === 'number';
        case 'boolean': return isScalar(node) && typeof node.value === 'boolean';
        case 'null': return isScalar(node) && node.value === null;
        default: return true;
    }
}