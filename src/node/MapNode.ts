/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Wrapper view over a raw mapping contract.
 * `children` exposes each branch keyed by its key in source order (`keys` is the order authority; numeric-like keys survive round-trips); `value` projects to a plain object and assigning it rebuilds the branches in place at the map's own entry indentation.
 * @license Apache-2.0
 */

import { MAP, IsMap, IsNode, isMap, JsonValue, NodeType } from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';

import toJS from '../support/toJS.js';
import Pathing from '../support/Pathing.js';

import YamlError from '../YamlError.js';
import Node from './Node.js';

import type Document from '../Document.js';

export class MapNode extends Node implements IsMap {
    public readonly [MAP]: true = true;

    public constructor(node: IsMap, document: Document) { super(node, document); }

    public override get contract(): IsMap {
        if (!isMap(this.vNode)) throw new YamlError('MapNode contract is not a map');
        return this.vNode;
    }

    public get keys(): string[] { return this.contract.keys; }

    public override get children(): Record<string, Node> {
        const out: Record<string, Node> = {};
        for (const key of this.contract.keys) out[key] = this.vDocument.wrap(this.contract.children[key]);
        return out;
    }

    public override get value(): JsonValue {
        const out: { [key: string]: JsonValue } = {};
        for (const key of this.contract.keys) out[key] = toJS(this.contract.children[key]);
        return out;
    }

    public override set value(value: JsonValue) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new YamlError('A map value must be a plain object');
        const record = value;
        const unit = Factory.childUnit(this.contract);
        const entryBase = Factory.entryIndent(this.contract, unit, this.vDocument.root.contract === this.contract);
        const entries: Array<[string, IsNode]> = Object.entries(record).map(([key, entry]): [string, IsNode] => {
            const child = Factory.subtree(entry, entryBase, Factory.deeper(entryBase, unit), unit, false);
            Factory.seatKey(child, key);
            return [key, child];
        });
        const children: { [key: string]: IsNode } = {};
        const keys: string[] = [];
        for (const [key, child] of entries) {
            children[key] = child;
            keys.push(key);
        }
        this.contract.children = children;
        this.contract.keys = keys;
        this.contract.meta.dirty = true;
    }

    public override clone(): MapNode {
        const wrapped = this.vDocument.wrap(Factory.clone(this.contract));
        if (!(wrapped instanceof MapNode)) throw new YamlError('Cloned map contract did not wrap to a MapNode');
        return wrapped;
    }

    /**
     * Reads the child at a dot-separated path restricted to a map, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a map.
     */
    public getChild(key: string): Node | null {
        const child = Pathing.getChild(this.contract, key);
        return child ? this.vDocument.wrap(child) : null;
    }

    /**
     * Point mutation of one entry: replaces the existing item's value structurally, updates a compatible scalar in
     * place (preserving style/raw metadata) or rebuilds the subtree. A node argument is cloned (single-owner).
     * @returns The node attached at the key.
     */
    public put(key: string, value: JsonValue | Node, type?: NodeType): Node | null {
        const raw = value instanceof Node ? value.contract : value;
        const node = Pathing.put(this.contract, key, raw, { unit: this.vDocument.unit, root: this.vDocument.root.contract }, type);
        return node ? this.vDocument.wrap(node) : null;
    }

    /**
     * Removes the entry at the given key, returning `true` if it was present and removed, or `false` if it was not present.
     * @param key - The key of the entry to remove.
     * @returns `true` if the entry was present and removed, `false` if it was not present.
     */
    public remove(key: string): boolean {
        return Pathing.remove(this.contract, key);
    }
}

export namespace MapNode {}

export default MapNode;