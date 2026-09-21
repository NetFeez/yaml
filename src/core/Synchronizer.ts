/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Synchronizes a document payload against a plain JSON value, preserving untouched formatting.
 * Maps keep/replace/drop keys, lists reconcile by index and scalars update in place when they differ; returns the (possibly replaced) root contract so the class layer can re-wrap it.
 * @license Apache-2.0
 */

import { IsDocument, IsNode, IsMap, IsList, JsonValue, isScalar, isMap, isList } from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';

export class Synchronizer {
    /**
     * Synchronizes the document payload against a plain JSON value, preserving untouched formatting.
     * @param doc - The document payload to update in place.
     * @param json - The target plain value.
     * @returns The root contract of the synced payload (fresh when the root kind had to be replaced).
     */
    public static sync(doc: IsDocument, json: JsonValue): IsNode {
        return Synchronizer.place(doc.root, json, '', doc.unit).node;
    }

    /**
     * Places a JSON value into the position of an existing node, replacing it when the kind is incompatible.
     * @param existing - The node currently at the position.
     * @param json - The target plain value.
     * @param ctx - The entry indentation context of the position.
     * @param unit - The indentation unit of the document.
     * @returns The node at the position after the sync, and whether it changed.
     */
    private static place(existing: IsNode, json: JsonValue, ctx: string, unit: number): { node: IsNode; changed: boolean } {
        if (json !== null && typeof json === 'object') {
            if (Array.isArray(json)) {
                if (isList(existing)) return Synchronizer.syncList(existing, json, ctx, unit);
                return { node: Synchronizer.freshAt(existing, json, ctx, unit), changed: true };
            }
            if (isMap(existing)) return Synchronizer.syncMap(existing, json, ctx, unit);
            return { node: Synchronizer.freshAt(existing, json, ctx, unit), changed: true };
        }
        if (isScalar(existing) && Object.is(existing.value, json)) return { node: existing, changed: false };
        return { node: Synchronizer.freshAt(existing, json, ctx, unit), changed: true };
    }

    /**
     * Builds a fresh subtree at an existing node's position, keeping its own-line indent and child depth (list-item positions keep the dash spelling).
     * @param existing - The node being replaced.
     * @param json - The target plain value.
     * @param ctx - The child indentation context of the position.
     * @param unit - The indentation unit of the document.
     * @returns A fresh contract subtree for the value.
     */
    private static freshAt(existing: IsNode, json: JsonValue, ctx: string, unit: number): IsNode {
        const listItem = existing.meta.prefix.includes('-');
        return Factory.subtree(json, Synchronizer.itemIndent(existing), ctx, unit, listItem);
    }

    /**
     * Synchronizes a map against a plain object: keys drop when missing, update when present and are appended in object order when new.
     * @param node - The map contract to update in place.
     * @param json - The target plain object.
     * @param ctx - The entry indentation context of the map's children.
     * @param unit - The indentation unit of the document.
     * @returns The synced map and whether it changed.
     */
    private static syncMap(node: IsMap, json: { [key: string]: JsonValue }, ctx: string, unit: number): { node: IsMap; changed: boolean } {
        let changed = false;
        const keys = new Set(Object.keys(json));
        const kept = node.keys.filter(key => keys.has(key));
        if (kept.length !== node.keys.length) changed = true;
        const keptChildren: { [key: string]: IsNode } = {};
        for (const key of kept) keptChildren[key] = node.children[key];
        node.keys = kept;
        node.children = keptChildren;
        for (let i = 0; i < node.keys.length; i++) {
            const key = node.keys[i];
            const child = node.children[key];
            const result = Synchronizer.place(child, json[key], Synchronizer.childCtx(child, unit), unit);
            if (result.changed) {
                Synchronizer.replaceAtMap(node, key, result.node);
                changed = true;
            }
        }
        const present = new Set(node.keys);
        for (const key of Object.keys(json)) {
            if (present.has(key)) continue;
            const prefix = node.keys.length > 0 ? Synchronizer.itemIndent(node.children[node.keys[node.keys.length - 1]]) : ctx;
            const fresh = Synchronizer.freshItem(key, json[key], prefix, false, unit);
            node.keys.push(key);
            node.children[key] = fresh;
            changed = true;
        }
        if (changed) node.meta.dirty = true;
        return { node, changed };
    }

    /**
     * Synchronizes a list against a plain array: items reconcile by index and trailing items are dropped or appended.
     * @param node - The list contract to update in place.
     * @param json - The target plain array.
     * @param ctx - The entry indentation context of the list's items.
     * @param unit - The indentation unit of the document.
     * @returns The synced list and whether it changed.
     */
    private static syncList(node: IsList, json: JsonValue[], ctx: string, unit: number): { node: IsList; changed: boolean } {
        let changed = false;
        const common = Math.min(node.children.length, json.length);
        for (let i = 0; i < common; i++) {
            const result = Synchronizer.place(node.children[i], json[i], Synchronizer.childCtx(node.children[i], unit), unit);
            if (result.changed) {
                Synchronizer.replaceAtList(node.children, i, result.node);
                changed = true;
            }
        }
        if (node.children.length > json.length) {
            node.children = node.children.slice(0, json.length);
            changed = true;
        } else if (node.children.length < json.length) {
            const prefix = node.children.length > 0 ? Synchronizer.itemIndent(node.children[node.children.length - 1]) : ctx;
            for (let i = node.children.length; i < json.length; i++) node.children.push(Synchronizer.freshItem('', json[i], prefix, true, unit));
            changed = true;
        }
        if (changed) node.meta.dirty = true;
        return { node, changed };
    }

    /**
     * Seats a replacement node into an existing map slot, adopting its source position and comments.
     * @param node - The map contract containing the slot.
     * @param key - The key of the slot to replace.
     * @param fresh - The new node to seat at the slot.
     */
    private static replaceAtMap(node: IsMap, key: string, fresh: IsNode): void {
        const old = node.children[key];
        if (fresh === old) return;
        Factory.seat(fresh, old);
        node.children[key] = fresh;
    }

    /**
     * Seats a replacement node into an existing list slot, adopting its source position and comments.
     * @param children - The list of children.
     * @param index - The index of the slot to replace.
     * @param fresh - The new node to seat at the slot.
     */
    private static replaceAtList(children: IsNode[], index: number, fresh: IsNode): void {
        const old = children[index];
        if (fresh === old) return;
        Factory.seat(fresh, old);
        children[index] = fresh;
    }

    /**
     * Reads the leading indentation of a node's own entry line.
     * @param node - The node to read the indentation of.
     * @returns The leading indentation of the node's own entry line.
     */
    private static itemIndent(node: IsNode): string {
        const match = node.meta.prefix.match(/^ */);
        return ' '.repeat(match ? match[0].length : 0);
    }

    /**
     * Computes the child indentation context of a node: its own indent plus one unit.
     * @param node - The node to compute the child context for.
     * @param unit - The indentation unit of the document.
     * @returns The child indentation context.
     */
    private static childCtx(node: IsNode, unit: number): string {
        return Synchronizer.itemIndent(node) + ' '.repeat(unit);
    }

    /**
     * Builds a fresh entry for a new key or index of a container being synced.
     * @param key - The map key of the entry (empty for list items).
     * @param json - The target plain value.
     * @param indent - The entry indentation prefix.
     * @param isList - Whether the entry is a list item.
     * @param unit - The indentation unit of the document.
     * @returns A fresh contract subtree for the entry.
     */
    private static freshItem(key: string, json: JsonValue, indent: string, isList: boolean, unit: number): IsNode {
        const child = Factory.subtree(json, indent, Factory.deeper(indent, unit), unit, isList);
        if (!isList) Factory.seatKey(child, key);
        return child;
    }
}

export namespace Synchronizer {}

export default Synchronizer;