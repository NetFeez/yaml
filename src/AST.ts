/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Syntax tree model for the supported YAML subset, carrying source formatting metadata for lossless round-trips.
 *
 * Responsibilities: `Node` owns pathing (`get`/`set`/`delete`), typed accessors (`getMap`/`getList`/`getNumber`),
 * comment attachment (`lead`/`inline`) and dispatch. Every `Node` is also its own entry: it carries the source text of
 * the line where it lives (`lead`, `prefix`, `token`, `sep`, `rest`, `inline`, `wrapped`, `key`), so there is no separate
 * wrapper type and comments are reachable straight from any node. Containers store their children directly in
 * `items: Node[]`; a parsed container records the indentation of its entries in `base`.
 *
 * `set()` is a point mutation (never a reconciliation): a plain value updates a compatible scalar in place preserving
 * style/raw metadata; any other shape rebuilds the subtree. List gaps are intentionally padded with `null` entries and
 * `delete()` never garbage-collects empty parents (documented, tested invariants). Single-owner semantics: a `Node`
 * passed as a value is cloned before being attached, so subtree sharing is impossible every mutation stays local.
 * `Synchronizer.apply()` remains the only deep reconciliation.
 * @license Apache-2.0
 */

import ScalarUtils from './ScalarUtils.js';
import YamlError from './YamlError.js';

export const Symbols = {
    node: Symbol.for('yaml.node'),
    document: Symbol.for('yaml.document'),
    map: Symbol.for('yaml.map'),
    list: Symbol.for('yaml.list'),
    scalar: Symbol.for('yaml.scalar'),
} as const;

export namespace AST {
    export type Primitive = null | boolean | number | string;
    export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };
    export type ScalarStyle = 'plain' | 'single' | 'double' | 'literal' | 'folded';
    export type NodeType = 'map' | 'list' | 'string' | 'number' | 'boolean' | 'null';

    /** Reads the leading indentation of a node's own entry line. */
    export function indentOf(node: Node | undefined): string {
        if (!node) return '';
        const match = node.prefix.match(/^ */);
        return match ? match[0] : '';
    }

    /** Computes the indentation one unit deeper than a given indentation. */
    export function deeper(indent: string, unit: number): string {
        return `${indent}${' '.repeat(unit)}`;
    }

    /** Computes the indentation a node's child entries use, one unit deeper than the node itself. */
    export function childIndent(node: Node, unit: number): string {
        return AST.deeper(AST.indentOf(node), unit);
    }

    /** Detects the indentation unit used by a container's existing grandchild entries, for in-place content
     * replacement. Falls back to 2 when there is no nested entry to measure. */
    export function childUnit(items: Node[]): number {
        for (const child of items) {
            if (child.symbol !== Symbols.map && child.symbol !== Symbols.list) continue;
            const grand = (child as MapNode | ListNode).items[0];
            if (!grand) continue;
            const unit = AST.indentOf(grand).length - AST.indentOf(child).length;
            if (unit > 0) return unit;
        }
        return 2;
    }

    /**
     * Builds a fresh entry node representing a plain JSON value. `prefixIndent` is the indentation of the *entry's own
     * line*, `childrenBase` the indentation of its child entries ("" for a root container); `isList` selects the dash
     * spelling. Container values build nested entries one unit deeper than their own line.
     */
    export function subtree(json: AST.JsonValue, prefixIndent: string, childrenBase: string, unit: number, isList: boolean): Node {
        const isContainer = json !== null && typeof json === 'object';
        const prefix = isList ? (isContainer ? `${prefixIndent}-` : `${prefixIndent}- `) : prefixIndent;
        if (!isContainer) return new ScalarNode(json, 'plain', null, [], true, prefix);
        const deeperChildren = AST.deeper(childrenBase, unit);
        if (Array.isArray(json)) {
            const list = new ListNode([], prefix, childrenBase, true);
            for (const entry of json) list.items.push(AST.subtree(entry, childrenBase, deeperChildren, unit, true));
            return list;
        }
        const map = new MapNode([], prefix, childrenBase, true);
        for (const [key, value] of Object.entries(json)) {
            const child = AST.subtree(value, childrenBase, deeperChildren, unit, false);
            AST.seatKey(child, key);
            map.items.push(child);
        }
        return map;
    }

    /** Gives a map child its key entry fields, preserving its content. */
    export function seatKey(node: Node, key: string): void {
        node.key = key;
        node.token = ScalarUtils.render(key);
        node.sep = ':';
        node.dirty = true;
    }

    /** Copies the entry fields of a source node onto a target, preserving the target's content. `rest` (the old
     * value text) is not carried over: a seated target is always re-rendered from its own value. `wrapped` only
     * survives when the target is itself a container. */
    export function seat(target: Node, from: Node): void {
        const isContainer = target.symbol === Symbols.map || target.symbol === Symbols.list;
        target.lead = from.lead;
        target.prefix = from.prefix;
        target.token = from.token;
        target.sep = from.sep;
        target.rest = '';
        target.inline = from.inline;
        target.wrapped = isContainer && from.wrapped;
        target.key = from.key;
        target.dirty = true;
    }

    /** Prepares a cloned node to become a bare entry at a new position: the positional prefix is rewritten, the
     * source key text (`token`/`sep`/`key`) and value text (`rest`) are cleared and the wrapped flag dropped; the
     * node is marked dirty so its value re-renders. Comments travel with the node. */
    export function reseat(node: Node, prefix: string): void {
        node.prefix = prefix;
        node.token = '';
        node.sep = '';
        node.rest = '';
        node.key = '';
        node.wrapped = false;
        node.dirty = true;
    }
}

export abstract class Node {
    public static readonly symbol = Symbols.node;
    public abstract readonly symbol: symbol;
    public dirty: boolean;
    public lead: string[] = [];
    public prefix = '';
    public token = '';
    public sep = '';
    public rest = '';
    public inline: string | null = null;
    public wrapped = false;
    public key = '';

    public constructor(dirty = false) { this.dirty = dirty; }

    /** Reads the plain value of this node: the scalar's primitive, or a deep JSON rendering of a container. */
    public abstract get value();

    /**
     * Replaces the value of this node in place. A scalar takes any primitive and re-renders preserving its
     * style; a container takes a same-shape JSON value, rebuilding its children at its own entry indentation
     * while keeping its position and comments; a document replaces its root. Shape mismatches throw
     * `YamlError` — a node cannot change its kind in place without knowing its parent.
     */
    public abstract set value(value: AST.JsonValue);

    /** Deep-copies this node (content and entry fields) into an independent subtree. */
    public abstract clone(): Node;

    /** Reads the node at a dot-separated path (map keys and numeric list indices). */
    public get(path: string): MapNode | ListNode | ScalarNode | null {
        let current: Node = this;
        if (current.symbol === Symbols.document) {
            const root = (current as DocumentNode).root;
            if (!root) return null;
            current = root;
        }
        for (const part of path.split('.')) {
            const next = Node.step(current, part);
            if (!next) return null;
            current = next;
        }
        return current as MapNode | ListNode | ScalarNode;
    }

    /**
     * Point mutation: sets the node at a dot-separated path, creating intermediate containers as needed.
     * A node argument is cloned (single-owner) and updated in place when the target is a compatible scalar.
     * When `type` is given, the requested value is validated against it before the mutation and a
     * `YamlError` is thrown if it does not match (nothing is written in that case).
     * Navigation can only begin from a DocumentNode, a MapNode or a ListNode: calling `set()` on a
     * ScalarNode (or on a path that ends at one) leaves the tree untouched.
     */
    public set(path: string, value: AST.JsonValue | MapNode | ListNode | ScalarNode, type?: AST.NodeType): void {
        const doc = Node.documentOf(this);
        const unit = doc ? doc.unit : 2;
        if (type) {
            const prospective = value instanceof Node ? value : AST.subtree(value, '', '', unit, false);
            if (!Node.matchesType(prospective, type)) throw new YamlError(`Value for path "${path}" is not of expected type "${type}"`);
        }
        let start: MapNode | ListNode;
        if (doc) {
            if (!doc.root || (doc.root.symbol !== Symbols.map && doc.root.symbol !== Symbols.list)) doc.root = new MapNode([], '', '', true);
            start = doc.root as MapNode | ListNode;
        } else {
            const container = Node.containerOf(this);
            if (!container) return;
            start = container;
        }
        Node.setFrom(start, path.split('.'), value, unit);
    }

    /** Reads the child at a dot-separated path restricted to a map, or `null` otherwise. */
    public getMap(path: string): MapNode | null {
        const node = this.get(path);
        return node instanceof MapNode ? node : null;
    }

    /** Reads the child at a dot-separated path restricted to a list, or `null` otherwise. */
    public getList(path: string): ListNode | null {
        const node = this.get(path);
        return node instanceof ListNode ? node : null;
    }

    /** Reads the child at a dot-separated path restricted to a numeric scalar, or `null` otherwise. */
    public getNumber(path: string): number | null {
        const node = this.get(path);
        if (!(node instanceof ScalarNode) || typeof node.value !== 'number') return null;
        return node.value;
    }

    /**
     * Adds a comment line above the field at a dot-separated path. With `autoIndent` (default) the comment is
     * prefixed with the field's own indentation. A comment already starting with `#` is used as-is.
     * @throws YamlError when the path does not resolve to an existing field.
     */
    public addLead(path: string, comment: string, autoIndent = true): void {
        const node = this.get(path);
        if (!node) throw new YamlError(`No field found at comment path "${path}"`);
        const text = comment.startsWith('#') ? comment : `# ${comment}`;
        node.lead.push(autoIndent ? `${AST.indentOf(node)}${text}` : text);
    }

    /**
     * Sets a trailing comment on the field's value line at a dot-separated path, re-rendering the line so the comment
     * is emitted. A comment already starting with `#` is used as-is.
     * @throws YamlError when the path does not resolve to an existing field.
     */
    public addInline(path: string, comment: string): void {
        const node = this.get(path);
        if (!node) throw new YamlError(`No field found at comment path "${path}"`);
        node.inline = comment.startsWith('#') ? comment : `# ${comment}`;
        node.dirty = true;
    }

    /**
     * Deletes exactly the node at a dot-separated path, returning whether anything was removed.
     * Empty parent containers are kept: delete() never garbage-collects.
     */
    public delete(path: string): boolean {
        let current: Node = this;
        if (current.symbol === Symbols.document) {
            const root = (current as DocumentNode).root;
            if (!root) return false;
            current = root;
        }
        const parts = path.split('.');
        for (let i = 0; i < parts.length - 1; i++) {
            const next = Node.step(current, parts[i]);
            if (!next) return false;
            current = next;
        }
        const key = parts[parts.length - 1];
        if (current.symbol === Symbols.map) return (current as MapNode).remove(key);
        if (current.symbol === Symbols.list) return (current as ListNode).remove(key);
        return false;
    }

    private static step(node: Node, part: string): Node | null {
        if (node.symbol === Symbols.map) return (node as MapNode).getChild(part);
        if (node.symbol === Symbols.list) return (node as ListNode).getChild(part);
        return null;
    }

    private static documentOf(node: Node): DocumentNode | null {
        return node.symbol === Symbols.document ? node as DocumentNode : null;
    }

    private static containerOf(node: Node): MapNode | ListNode | null {
        return node.symbol === Symbols.map || node.symbol === Symbols.list ? node as MapNode | ListNode : null;
    }

    /** Verifies that a node matches the requested explicit type. */
    private static matchesType(node: Node, type: AST.NodeType): boolean {
        switch (type) {
            case 'map': return node instanceof MapNode;
            case 'list': return node instanceof ListNode;
            case 'string': return node instanceof ScalarNode && typeof node.value === 'string';
            case 'number': return node instanceof ScalarNode && typeof node.value === 'number';
            case 'boolean': return node instanceof ScalarNode && typeof node.value === 'boolean';
            case 'null': return node instanceof ScalarNode && node.value === null;
            default: return true;
        }
    }

    private static setFrom(container: MapNode | ListNode, parts: string[], value: AST.JsonValue | MapNode | ListNode | ScalarNode, unit: number): void {
        if (parts.length === 1) {
            container.put(parts[0], value, unit);
            container.dirty = true;
            return;
        }
        const head = parts[0];
        const child = container.getChild(head);
        if (child && (child.symbol === Symbols.map || child.symbol === Symbols.list)) {
            Node.setFrom(child as MapNode | ListNode, parts.slice(1), value, unit);
            child.dirty = true;
            return;
        }
        const indexed = /^\d+$/.test(parts[1]);
        const fresh: MapNode | ListNode = indexed ? new ListNode([], '', '', true) : new MapNode([], '', '', true);
        const attached = container.put(head, fresh, unit);
        Node.setFrom(attached as MapNode | ListNode, parts.slice(1), value, unit);
    }

    /**
     * Re-indents a subtree that has just been seated at a new location. The container's own entry line keeps its
     * seated prefix (the node is an entry), while every child prefix is rewritten from the node's children `base`
     * so the relocated content renders at the correct depth. Non-containers are left untouched.
     */
    protected static reflow(node: Node, unit: number): void {
        if (node.symbol !== Symbols.map && node.symbol !== Symbols.list) return;
        const container = node as MapNode | ListNode;
        const base = AST.deeper(AST.indentOf(container), unit);
        container.base = base;
        const dash = container instanceof ListNode;
        for (const child of container.items) {
            const isContainer = child.symbol === Symbols.map || child.symbol === Symbols.list;
            child.prefix = dash ? (isContainer ? `${base}-` : `${base}- `) : base;
            child.dirty = true;
            if (isContainer) Node.reflow(child, unit);
        }
    }
}

export class DocumentNode extends Node {
    public static readonly symbol = Symbols.document;
    public readonly symbol = Symbols.document;
    public unit: number;
    public header: string[];
    public root: Node | null;
    public footer: string[];
    public constructor(unit = 2, header: string[] = [], root: Node | null = null, footer: string[] = []) {
        super(false);
        this.unit = unit;
        this.header = header;
        this.root = root;
        this.footer = footer;
    }

    public get value(): AST.JsonValue {
        return this.root ? this.root.value : null;
    }

    public set value(value: AST.JsonValue) {
        this.root = AST.subtree(value, '', '', this.unit, false);
        this.dirty = true;
    }

    public clone(): Node {
        const out = new DocumentNode(this.unit, [...this.header], this.root ? this.root.clone() : null, [...this.footer]);
        out.dirty = this.dirty;
        return out;
    }
}

export class MapNode extends Node {
    public static readonly symbol = Symbols.map;
    public readonly symbol = Symbols.map;
    public items: Node[];
    public base: string;

    public constructor(items: Node[] = [], prefix = '', base = '', dirty = false) {
        super(dirty);
        this.items = items;
        this.prefix = prefix;
        this.base = base;
    }

    public get value(): AST.JsonValue {
        const out: { [key: string]: AST.JsonValue } = {};
        for (const child of this.items) out[child.key] = child.value;
        return out;
    }

    public set value(value: AST.JsonValue) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new YamlError('A map value must be a plain object');
        const record = value as { [key: string]: AST.JsonValue };
        const unit = AST.childUnit(this.items);
        const childrenBase = AST.deeper(this.base, unit);
        this.items = Object.entries(record).map(([key, entry]) => {
            const child = AST.subtree(entry, this.base, childrenBase, unit, false);
            AST.seatKey(child, key);
            return child;
        });
        this.dirty = true;
    }

    public clone(): Node {
        const out = new MapNode(this.items.map(child => child.clone()), this.prefix, this.base, this.dirty);
        out.lead = [...this.lead];
        out.token = this.token;
        out.sep = this.sep;
        out.rest = this.rest;
        out.inline = this.inline;
        out.wrapped = this.wrapped;
        out.key = this.key;
        return out;
    }

    /** Reads the child mapped under a key. */
    public getChild(key: string): MapNode | ListNode | ScalarNode | null {
        const child = this.items.find(entry => entry.key === key);
        return child ? child as MapNode | ListNode | ScalarNode : null;
    }

    /**
     * Point mutation of one entry: replaces the existing item's value structurally,
     * updates a compatible scalar in place (preserving style/raw metadata) or rebuilds the subtree.
     * A node argument is cloned (single-owner) and seated at the destination.
     * Creating a new key never removes surrounding entries.
     * @returns The node attached at the key.
     */
    public put(key: string, value: AST.JsonValue | MapNode | ListNode | ScalarNode, unit = 2): Node {
        const base = this.base;
        const index = this.items.findIndex(entry => entry.key === key);
        if (index >= 0) {
            const old = this.items[index];
            if (value instanceof Node) {
                const clone = value.clone();
                AST.seat(clone, old);
                Node.reflow(clone, unit);
                this.items[index] = clone;
                this.dirty = true;
                return clone;
            }
            if (old.symbol === Symbols.scalar && (value === null || typeof value !== 'object')) {
                (old as ScalarNode).update(value);
                this.dirty = true;
                return old;
            }
            const fresh = AST.subtree(value, AST.indentOf(old), AST.childIndent(old, unit), unit, false);
            AST.seat(fresh, old);
            Node.reflow(fresh, unit);
            this.items[index] = fresh;
            this.dirty = true;
            return fresh;
        }
        let child: Node;
        if (value instanceof Node) {
            child = value.clone();
            AST.reseat(child, base);
            Node.reflow(child, unit);
        } else {
            child = AST.subtree(value, base, AST.deeper(base, unit), unit, false);
        }
        AST.seatKey(child, key);
        this.items.push(child);
        this.dirty = true;
        return child;
    }

    /** Removes exactly the entry mapped under a key, keeping empty containers as-is. */
    public remove(key: string): boolean {
        const index = this.items.findIndex(entry => entry.key === key);
        if (index < 0) return false;
        this.items.splice(index, 1);
        this.dirty = true;
        return true;
    }
}

export class ListNode extends Node {
    public static readonly symbol = Symbols.list;
    public readonly symbol = Symbols.list;
    public items: Node[];
    public base: string;
    public constructor(items: Node[] = [], prefix = '', base = '', dirty = false) {
        super(dirty);
        this.items = items;
        this.prefix = prefix;
        this.base = base;
    }

    public get value(): AST.JsonValue {
        return this.items.map(child => child.value);
    }

    public set value(value: AST.JsonValue) {
        if (!Array.isArray(value)) throw new YamlError('A list value must be an array');
        const unit = AST.childUnit(this.items);
        const childrenBase = AST.deeper(this.base, unit);
        this.items = value.map(entry => AST.subtree(entry, this.base, childrenBase, unit, true));
        this.dirty = true;
    }

    public clone(): Node {
        const out = new ListNode(this.items.map(child => child.clone()), this.prefix, this.base, this.dirty);
        out.lead = [...this.lead];
        out.token = this.token;
        out.sep = this.sep;
        out.rest = this.rest;
        out.inline = this.inline;
        out.wrapped = this.wrapped;
        out.key = this.key;
        return out;
    }

    /** Reads the child at a numeric index. */
    public getChild(index: string): MapNode | ListNode | ScalarNode | null {
        if (!/^\d+$/.test(index)) return null;
        const child = this.items[Number(index)];
        return child ? child as MapNode | ListNode | ScalarNode : null;
    }

    /**
     * Point mutation of one position: replaces the existing item's value structurally,
     * updates a compatible scalar in place or rebuilds the subtree.
     * Gaps between the current length and a higher index are intentionally filled with `null` entries.
     * @returns The node attached at the index.
     */
    public put(key: string, value: AST.JsonValue | MapNode | ListNode | ScalarNode, unit = 2): Node {
        if (!/^\d+$/.test(key)) return this.items[0] ?? new ScalarNode(null, 'plain');
        const index = Number(key);
        const base = this.base;
        if (index < this.items.length) {
            const old = this.items[index];
            if (value instanceof Node) {
                const clone = value.clone();
                AST.seat(clone, old);
                Node.reflow(clone, unit);
                this.items[index] = clone;
                this.dirty = true;
                return clone;
            }
            if (old.symbol === Symbols.scalar && (value === null || typeof value !== 'object')) {
                (old as ScalarNode).update(value);
                this.dirty = true;
                return old;
            }
            const fresh = AST.subtree(value, AST.indentOf(old), AST.childIndent(old, unit), unit, true);
            AST.seat(fresh, old);
            Node.reflow(fresh, unit);
            this.items[index] = fresh;
            this.dirty = true;
            return fresh;
        }
        while (this.items.length < index) {
            const gap = new ScalarNode(null, 'plain', null, [], true, `${base}- `);
            this.items.push(gap);
        }
        let child: Node;
        if (value instanceof Node) {
            child = value.clone();
            const isContainer = child.symbol === Symbols.map || child.symbol === Symbols.list;
            AST.reseat(child, isContainer ? `${base}-` : `${base}- `);
            Node.reflow(child, unit);
        } else {
            child = AST.subtree(value, base, AST.deeper(base, unit), unit, true);
        }
        this.items.push(child);
        this.dirty = true;
        return child;
    }

    /** Removes exactly the item at a numeric index, keeping empty containers as-is. */
    public remove(key: string): boolean {
        if (!/^\d+$/.test(key)) return false;
        const index = Number(key);
        if (index >= this.items.length) return false;
        this.items.splice(index, 1);
        this.dirty = true;
        return true;
    }
}

export class ScalarNode extends Node {
    public static readonly symbol = Symbols.scalar;
    public readonly symbol = Symbols.scalar;
    public vValue: AST.Primitive;
    public style: AST.ScalarStyle;
    public chomp: '-' | '+' | null;
    public raw: string[];
    public constructor(value: AST.Primitive, style: AST.ScalarStyle = 'plain', chomp: '-' | '+' | null = null, raw: string[] = [], dirty = false, prefix = '') {
        super(dirty);
        this.vValue = value;
        this.style = style;
        this.chomp = chomp;
        this.raw = raw;
        this.prefix = prefix;
    }

    public get value(): AST.Primitive {
        return this.vValue;
    }

    public set value(value: AST.JsonValue) {
        if (value !== null && typeof value === 'object') throw new YamlError('Cannot give a scalar a container value in place; replace it through set() on its parent');
        this.update(value as AST.Primitive);
    }

    public clone(): Node {
        const out = new ScalarNode(this.vValue, this.style, this.chomp, [...this.raw], this.dirty, this.prefix);
        out.lead = [...this.lead];
        out.token = this.token;
        out.sep = this.sep;
        out.rest = this.rest;
        out.inline = this.inline;
        out.wrapped = this.wrapped;
        out.key = this.key;
        return out;
    }

    /**
     * In-place value update preserving this node's style/raw metadata.
     * Any primitive may become any other primitive as long as the style remains representable;
     * otherwise the caller replaces the node.
     */
    public update(value: AST.Primitive): void {
        this.vValue = value;
        this.dirty = true;
    }
}

export default AST;