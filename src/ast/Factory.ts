/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Contract factory: builds plain contract nodes, clones/seats subtrees and computes the formatting indentation the pipeline needs.
 * Nothing from the class layer is ever imported here, so this module is safe to use from Parser, Serializer, Synchronizer and Pathing.
 * @license Apache-2.0
 */

import {
    Metadata, NODE, MAP, LIST, SCALAR,
    IsNode, IsMap, IsList, IsScalar, JsonValue, Primitive,
    isMap, isList, isScalar, orderedChildren,
} from './Contracts.js';

import ScalarUtils from '../support/ScalarUtils.js';

import YamlError from '../YamlError.js';

export namespace Factory {
    /** Fresh, untouched entry metadata. */
    export function metadata(): Metadata {
        return { dirty: false, lead: [], prefix: '', token: '', sep: '', rest: '', inline: null, wrapped: false, key: '' };
    }

    /**
     * Entry metadata for a newly built entry at a given prefix.
     * @param prefix - The indentation + token prefix of the new entry's own line.
     * @param dirty - Whether the entry is marked dirty; defaults to `true` so the serializer re-renders it.
     * @returns Fresh entry metadata with the given prefix.
     */
    export function entryMeta(prefix: string, dirty = true): Metadata {
        const out = metadata();
        out.prefix = prefix;
        out.dirty = dirty;
        return out;
    }

    /**
     * Builds a scalar contract.
     * @param value - The primitive value of the scalar.
     * @param style - The quoting style of the scalar (`plain`, `single` or `double`).
     * @param chomp - The chomping of a block scalar: `-` strips, `+` keeps, `null` clips.
     * @param body - The raw body lines of a block scalar.
     * @param meta - The entry metadata to attach.
     * @returns A fresh scalar contract.
     */
    export function scalar(value: Primitive, style: IsScalar.Style, chomp: IsScalar.Chomp = null, body: string[] = [], meta: Metadata = metadata()): IsScalar {
        return { [NODE]: true, [SCALAR]: true, meta, value, style, chomp, body };
    }

    /**
     * Builds a mapping contract from entries carrying their key in `meta.key`.
     * @param items - The child entry nodes, each carrying its key in `meta.key`.
     * @param meta - The entry metadata to attach.
     * @returns A fresh mapping contract.
     * @throws If two entries share the same key.
     */
    export function map(items: IsNode[], meta: Metadata = metadata()): IsMap {
        const children: { [key: string]: IsNode } = {};
        const keys: string[] = [];
        const seen = new Set<string>();
        for (const item of items) {
            const key = item.meta.key;
            if (seen.has(key)) throw new YamlError(`Duplicated mapping key "${key}"`);
            seen.add(key);
            children[key] = item;
            keys.push(key);
        }
        return { [NODE]: true, [MAP]: true, meta, children, keys };
    }

    /**
     * Builds a sequence contract.
     * @param children - The child entry nodes in order.
     * @param meta - The entry metadata to attach.
     * @returns A fresh sequence contract.
     */
    export function list(children: IsNode[], meta: Metadata = metadata()): IsList {
        return { [NODE]: true, [LIST]: true, meta, children };
    }

    // ================ indentation helpers ================

    /** Reads the leading indentation of a node's own entry line. */
    export function indentOf(node: IsNode | undefined): string {
        if (!node) return '';
        const match = node.meta.prefix.match(/^ */);
        return match ? match[0] : '';
    }

    /**
     * Computes the indentation one unit deeper than a given indentation.
     * @param indent - The base indentation string.
     * @param unit - The number of spaces per level.
     * @returns The base indentation extended by `unit` spaces.
     */
    export function deeper(indent: string, unit: number): string {
        return `${indent}${' '.repeat(unit)}`;
    }

    /**
     * Computes the indentation this node's child entries would use at the given unit.
     * @param node - The node whose children indentation to compute.
     * @param unit - The number of spaces per level.
     * @returns The node's own indentation extended by `unit` spaces.
     */
    export function childIndent(node: IsNode, unit: number): string {
        return Factory.deeper(Factory.indentOf(node), unit);
    }

    /**
     * Detects the indentation unit used by a container's existing grandchild entries, for in-place content replacement.
     * @param container - The container to measure.
     * @returns The measured unit, or 2 when there is no nested entry to measure.
     */
    export function childUnit(container: IsMap | IsList): number {
        for (const child of orderedChildren(container)) {
            if (!isMap(child) && !isList(child)) continue;
            const grand = orderedChildren(child)[0];
            if (!grand) continue;
            const unit = Factory.indentOf(grand).length - Factory.indentOf(child).length;
            if (unit > 0) return unit;
        }
        return 2;
    }

    /**
     * Computes the indentation *inside* a container where its own entries live; existing children are authoritative and an empty container derives the depth from its own entry line, except for the document root whose entries start at column zero.
     * @param container - The container whose entry indentation to compute.
     * @param unit - The number of spaces per level.
     * @param isRoot - Whether the container is the document root.
     * @returns The indentation string for the container's entries.
     */
    export function entryIndent(container: IsMap | IsList, unit: number, isRoot: boolean): string {
        const children = orderedChildren(container);
        if (children.length > 0) return Factory.indentOf(children[0]);
        if (isRoot) return Factory.indentOf(container);
        return Factory.deeper(Factory.indentOf(container), unit);
    }

    // ================ subtree building ================

    /**
     * Builds a fresh entry node representing a plain JSON value.
     * @param json - The plain value to represent.
     * @param prefixIndent - The indentation of the entry's own line.
     * @param childrenBase - The indentation of its child entries ("" for a root container).
     * @param unit - The number of spaces per level.
     * @param isList - Whether the entry is a list item (selects the dash spelling).
     * @returns A fresh contract subtree for the value.
     */
    export function subtree(json: JsonValue, prefixIndent: string, childrenBase: string, unit: number, isList: boolean): IsNode {
        if (json === null || typeof json !== 'object') {
            const prefix = isList ? `${prefixIndent}- ` : prefixIndent;
            return Factory.scalar(json, 'plain', null, [], Factory.entryMeta(prefix));
        }
        const prefix = isList ? `${prefixIndent}-` : prefixIndent;
        const deeperChildren = Factory.deeper(childrenBase, unit);
        if (Array.isArray(json)) {
            const out = Factory.list([], Factory.entryMeta(prefix));
            for (const entry of json) out.children.push(Factory.subtree(entry, childrenBase, deeperChildren, unit, true));
            return out;
        }
        const out = Factory.map([], Factory.entryMeta(prefix));
        for (const [key, value] of Object.entries(json)) {
            const child = Factory.subtree(value, childrenBase, deeperChildren, unit, false);
            Factory.seatKey(child, key);
            out.children[key] = child;
            out.keys.push(key);
        }
        return out;
    }

    /**
     * Gives a map child its key entry fields, preserving its content.
     * @param node - The child node to seat.
     * @param key - The map key of the entry.
     */
    export function seatKey(node: IsNode, key: string): void {
        node.meta.key = key;
        node.meta.token = ScalarUtils.render(key);
        node.meta.sep = ':';
        node.meta.dirty = true;
    }

    /**
     * Copies the entry fields of a source node onto a target, preserving the target's content.
     * @param target - The node receiving the entry fields.
     * @param from - The node whose entry fields are copied.
     */
    export function seat(target: IsNode, from: IsNode): void {
        const isContainer = isMap(target) || isList(target);
        target.meta.lead = from.meta.lead;
        target.meta.prefix = from.meta.prefix;
        target.meta.token = from.meta.token;
        target.meta.sep = from.meta.sep;
        target.meta.rest = '';
        target.meta.inline = from.meta.inline;
        target.meta.wrapped = isContainer && from.meta.wrapped;
        target.meta.key = from.meta.key;
        target.meta.dirty = true;
    }

    /**
     * Prepares a cloned node to become a bare entry at a new position: rewrites the positional prefix, clears the source key and value text, drops the wrapped flag and marks the node dirty so its value re-renders; comments travel with the node.
     * @param node - The node to reseat.
     * @param prefix - The new indentation + token prefix of the entry.
     */
    export function reseat(node: IsNode, prefix: string): void {
        node.meta.prefix = prefix;
        node.meta.token = '';
        node.meta.sep = '';
        node.meta.rest = '';
        node.meta.key = '';
        node.meta.wrapped = false;
        node.meta.dirty = true;
    }

    /**
     * Re-indents a subtree that has just been seated at a new location, rewriting every child prefix.
     * @param node - The root of the subtree to re-indent.
     * @param unit - The number of spaces per level.
     */
    export function reflow(node: IsNode, unit: number): void {
        if (!isMap(node) && !isList(node)) return;
        const container: IsMap | IsList = node;
        const base = Factory.deeper(Factory.indentOf(container), unit);
        const dash = isList(container);
        for (const child of orderedChildren(container)) {
            const childIsContainer = isMap(child) || isList(child);
            child.meta.prefix = dash ? (childIsContainer ? `${base}-` : `${base}- `) : base;
            child.meta.dirty = true;
            if (childIsContainer) Factory.reflow(child, unit);
        }
    }

    /**
     * Deep-copies a node (content and entry fields) into an independent subtree.
     * @param node - The node to copy.
     * @returns An independent copy of the node.
     * @throws If the node is not a scalar, map or list contract.
     */
    export function clone(node: IsNode): IsNode {
        if (isScalar(node)) return Factory.scalar(node.value, node.style, node.chomp, [...node.body], cloneMeta(node.meta));
        if (isList(node)) return Factory.list(node.children.map(child => Factory.clone(child)), cloneMeta(node.meta));
        if (isMap(node)) return Factory.map(node.keys.map(key => node.children[key]).map(child => Factory.clone(child)), cloneMeta(node.meta));
        throw new YamlError('Unknown node kind in clone()');
    }

    /**
     * Copies entry metadata, deep-copying the leading comment lines.
     * @param meta - The metadata to copy.
     * @returns An independent copy of the metadata.
     */
    function cloneMeta(meta: Metadata): Metadata {
        return { ...meta, lead: [...meta.lead] };
    }
}

export default Factory;