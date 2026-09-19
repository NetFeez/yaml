/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Synchronizes a YAML document tree against a plain JSON value, preserving untouched formatting.
 * @license Apache-2.0
 */

import { AST } from './AST.js';
import { Node, MapNode, ListNode, ScalarNode, DocumentNode } from './AST.js';

export class Synchronizer {
    /**
     * Synchronizes the document tree against a plain JSON value, preserving untouched formatting.
     * Maps gain, replace and drop keys; lists match by index truncating or extending; scalars update when they differ.
     * @param doc - The document tree to update in place.
     * @param json - The target plain value.
     */
    public static apply(doc: DocumentNode, json: AST.JsonValue): void {
        const unit = doc.unit;
        if (!doc.root) {
            if (json !== null && typeof json === 'object') doc.root = Synchronizer.freshContainer(json, '', unit);
            else if (json !== null) doc.root = AST.subtree(json, '', '', unit, false);
            return;
        }
        doc.root = Synchronizer.place(doc.root, json, '', unit).node;
    }

    private static place(existing: Node, json: AST.JsonValue, ctx: string, unit: number): { node: Node; changed: boolean } {
        if (json !== null && typeof json === 'object') {
            if (Array.isArray(json)) {
                if (existing instanceof ListNode) return Synchronizer.syncList(existing, json, ctx, unit);
                return { node: Synchronizer.freshContainer(json, ctx, unit), changed: true };
            }
            if (existing instanceof MapNode) return Synchronizer.syncMap(existing, json, ctx, unit);
            return { node: Synchronizer.freshContainer(json, ctx, unit), changed: true };
        }
        if (existing instanceof ScalarNode && Object.is(existing.value, json)) return { node: existing, changed: false };
        return { node: AST.subtree(json, '', '', unit, false), changed: true };
    }

    private static syncMap(node: MapNode, json: { [key: string]: AST.JsonValue }, ctx: string, unit: number): { node: MapNode; changed: boolean } {
        let changed = false;
        const keys = new Set(Object.keys(json));
        const kept = node.items.filter(child => keys.has(child.key));
        if (kept.length !== node.items.length) changed = true;
        node.items = kept;
        for (let i = 0; i < node.items.length; i++) {
            const child = node.items[i];
            const result = Synchronizer.place(child, json[child.key], Synchronizer.childCtx(child, unit), unit);
            if (result.changed) {
                Synchronizer.replaceAt(node.items, i, result.node);
                changed = true;
            }
        }
        const present = new Set(node.items.map(child => child.key));
        for (const key of Object.keys(json)) {
            if (present.has(key)) continue;
            const prefix = node.items.length > 0 ? Synchronizer.itemIndent(node.items[node.items.length - 1]) : ctx;
            node.items.push(Synchronizer.freshItem(key, json[key], prefix, false, unit));
            changed = true;
        }
        if (changed) node.dirty = true;
        return { node, changed };
    }

    private static syncList(node: ListNode, json: AST.JsonValue[], ctx: string, unit: number): { node: ListNode; changed: boolean } {
        let changed = false;
        const common = Math.min(node.items.length, json.length);
        for (let i = 0; i < common; i++) {
            const result = Synchronizer.place(node.items[i], json[i], Synchronizer.childCtx(node.items[i], unit), unit);
            if (result.changed) {
                Synchronizer.replaceAt(node.items, i, result.node);
                changed = true;
            }
        }
        if (node.items.length > json.length) {
            node.items = node.items.slice(0, json.length);
            changed = true;
        } else if (node.items.length < json.length) {
            const prefix = node.items.length > 0 ? Synchronizer.itemIndent(node.items[node.items.length - 1]) : ctx;
            for (let i = node.items.length; i < json.length; i++) node.items.push(Synchronizer.freshItem('', json[i], prefix, true, unit));
            changed = true;
        }
        if (changed) node.dirty = true;
        return { node, changed };
    }

    /** Seats a replacement node into an existing entry slot, adopting its source position and comments. */
    private static replaceAt(items: Node[], index: number, fresh: Node): void {
        const old = items[index];
        if (fresh === old) return;
        AST.seat(fresh, old);
        items[index] = fresh;
    }

    private static itemIndent(node: Node): string {
        const match = node.prefix.match(/^ */);
        return ' '.repeat(match ? match[0].length : 0);
    }

    private static childCtx(node: Node, unit: number): string {
        return Synchronizer.itemIndent(node) + ' '.repeat(unit);
    }

    private static freshItem(key: string, json: AST.JsonValue, indent: string, isList: boolean, unit: number): Node {
        const child = AST.subtree(json, indent, AST.deeper(indent, unit), unit, isList);
        if (!isList) AST.seatKey(child, key);
        return child;
    }

    private static freshContainer(json: AST.JsonValue, indent: string, unit: number): MapNode | ListNode {
        return AST.subtree(json, indent, AST.deeper(indent, unit), unit, false) as MapNode | ListNode;
    }
}

export namespace Synchronizer {}

export default Synchronizer;