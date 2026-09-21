/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Wrapper view over a raw sequence contract.
 * `children` exposes each item in order; `value` projects to a plain array and assigning it rebuilds the items in place at the list's own entry indentation; `put` beyond the current length pads the gap with `null` entries.
 * @license Apache-2.0
 */

import { LIST, IsList, isList, JsonValue, NodeType } from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';

import YamlError from '../YamlError.js';

import toJS from '../support/toJS.js';
import Pathing from '../support/Pathing.js';

import Node from './Node.js';

import type Document from '../Document.js';

export class ListNode extends Node implements IsList {
    public readonly [LIST]: true = true;

    public constructor(node: IsList, document: Document) { super(node, document); }

    public override get contract(): IsList {
        if (!isList(this.vNode)) throw new YamlError('ListNode contract is not a list');
        return this.vNode;
    }

    public override get children(): Node[] {
        return this.contract.children.map(child => this.vDocument.wrap(child));
    }

    public override get value(): JsonValue {
        return this.contract.children.map(child => toJS(child));
    }

    public override set value(value: JsonValue) {
        if (!Array.isArray(value)) throw new YamlError('A list value must be an array');
        const unit = Factory.childUnit(this.contract);
        const entryBase = Factory.entryIndent(this.contract, unit, this.vDocument.root.contract === this.contract);
        this.contract.children = value.map(entry => Factory.subtree(entry, entryBase, Factory.deeper(entryBase, unit), unit, true));
        this.contract.meta.dirty = true;
    }

    public override clone(): ListNode {
        const wrapped = this.vDocument.wrap(Factory.clone(this.contract));
        if (!(wrapped instanceof ListNode)) throw new YamlError('Cloned list contract did not wrap to a ListNode');
        return wrapped;
    }

    /**
     * Reads the child at a dot-separated path restricted to a list, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a list.
     */
    public getChild(index: string): Node | null {
        const child = Pathing.getChild(this.contract, index);
        return child ? this.vDocument.wrap(child) : null;
    }

    /**
     * Point mutation of one position: replaces the existing item's value structurally, updates a compatible scalar
     * in place or rebuilds the subtree. Gaps between the current length and a higher index are intentionally filled
     * with `null` entries. A node argument is cloned (single-owner).
     * @param index - The numeric index of the item to replace.
     * @param value - The new value to assign at the index.
     * @param type - Optional explicit type for the new value; if omitted, the type is inferred from the value.
     * @returns The node attached at the index, or `null` when the key is not a valid numeric index.
     */
    public put(index: string, value: JsonValue | Node, type?: NodeType): Node | null {
        const raw = value instanceof Node ? value.contract : value;
        const node = Pathing.put(this.contract, index, raw, { unit: this.vDocument.unit, root: this.vDocument.root.contract }, type);
        return node ? this.vDocument.wrap(node) : null;
    }

    /**
     * Removes exactly the item at a numeric index, keeping empty containers as-is.
     * @param index - The numeric index of the item to remove.
     * @returns `true` if the item was present and removed, `false` if it was not present.
     */
    public remove(index: string): boolean {
        return Pathing.remove(this.contract, index);
    }
}

export namespace ListNode {}

export default ListNode;