/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Dot-path navigation and point mutations over contract shapes only (no classes, no Document): resolve, setPath, deletePath, put and remove.
 * Indentation for freshly built entries derives from the existing tree via `Factory.entryIndent`.
 * @license Apache-2.0
 */

import {
    IsNode, IsMap, IsList, JsonValue, NodeType, matchesType,
    isNode, isMap, isList, isScalar, isContainer, orderedChildren,
} from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';
import YamlError from '../YamlError.js';

export class Pathing {
    /**
     * Gets the child node of a container (map or list) by key or index.
     * @param container - The container node (map or list).
     * @param key - The key (for maps) or index (for lists) of the child to retrieve.
     * @returns The child node if found; otherwise, null.
     */
    public static getChild(container: IsMap | IsList, key: string): IsNode | null {
        if (isMap(container)) return container.children[key] ?? null;
        if (!/^\d+$/.test(key)) return null;
        return container.children[Number(key)] ?? null;
    }

    /**
     * Resolves a dot-separated path from a root node, returning the node at the end of the path or null if any part is missing.
     * @param root - The root node to start from.
     * @param path - The dot-separated path to resolve.
     * @returns The node at the end of the path, or null if not found.
     */
    public static resolve(root: IsNode, path: string): IsNode | null {
        let current: IsNode = root;
        for (const part of path.split('.')) {
            if (!isContainer(current)) return null;
            const next = Pathing.getChild(current, part);
            if (!next) return null;
            current = next;
        }
        return current;
    }

    /**
     * Sets a value at a dot-separated path in a container, creating intermediate containers as needed. Returns the node at the end of the path or null if the path could not be resolved.
     * @param container - The container node (map or list) to start from.
     * @param parts - The dot-separated path parts to traverse.
     * @param value - The value to set at the end of the path.
     * @param ctx - The path context, including indentation unit and root node.
     * @returns The node at the end of the path, or null if the path could not be resolved.
     */
    public static setPath(container: IsMap | IsList, parts: string[], value: JsonValue | IsNode, ctx: Pathing.PathContext): IsNode | null {
        if (parts.length === 1) return Pathing.put(container, parts[0], value, ctx);
        const head = parts[0];
        const child = Pathing.getChild(container, head);
        if (child && isContainer(child)) return Pathing.setPath(child, parts.slice(1), value, ctx);
        const indexed = /^\d+$/.test(parts[1]);
        const fresh: IsMap | IsList = indexed ? Factory.list([]) : Factory.map([]);
        const attached = Pathing.put(container, head, fresh, ctx);
        if (!attached || !isContainer(attached)) return null;
        return Pathing.setPath(attached, parts.slice(1), value, ctx);
    }

    /**
     * Point mutation: sets a child node in a container (map or list) by key or index. For maps, the key is added to the keys array; for lists, the index is used to splice the children array. Empty parents are kept.
     * @param container - The container node (map or list).
     * @param key - The key (for maps) or index (for lists) of the child to set.
     * @param value - The new value to set at the specified key/index.
     * @param ctx - The path context, including indentation unit and root node.
     * @param type - Optional expected type for the value; if provided, the value must match this type.
     * @returns The attached node at the specified key/index, or `null` if the mutation could not target a position.
     * @throws If the value does not match the expected type (when `type` is provided).
     * @throws If the key is not a valid string (for maps) or index (for lists).
     * @throws If the value is not a valid JSON value or node.
     */
    public static put(container: IsMap | IsList, key: string, value: JsonValue | IsNode, ctx: Pathing.PathContext, type?: NodeType): IsNode | null {
        if (type) {
            const prospective = isNode(value) ? value : Factory.subtree(value, '', '', ctx.unit, false);
            if (!matchesType(prospective, type)) throw new YamlError(`Value for key "${key}" is not of expected type "${type}"`);
        }
        if (isMap(container)) return Pathing.putMap(container, key, value, ctx);
        return Pathing.putList(container, key, value, ctx);
    }

    /**
     * Point mutation: removes a node at a dot-separated path relative to a container. Returns true if a node was removed, false if the path could not be resolved.
     * @param root - The root node to start from.
     * @param path - The dot-separated path to the node to remove.
     * @returns True if a node was removed; false if the path could not be resolved.
     */
    public static deletePath(root: IsNode, path: string): boolean {
        const parts = path.split('.');
        let current: IsNode = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!isContainer(current)) return false;
            const next = Pathing.getChild(current, parts[i]);
            if (!next) return false;
            current = next;
        }
        const key = parts[parts.length - 1];
        if (!isContainer(current)) return false;
        return Pathing.remove(current, key);
    }

    /**
     * Point mutation: removes a child node from a container (map or list) by key or index. For maps, the key is spliced from the keys array; for lists, the index is spliced from the children array. Empty parents are kept.
     * @param container - The container node (map or list).
     * @param key - The key (for maps) or index (for lists) of the child to remove.
     * @returns True if a child was removed; false if the key/index was not found.
     */
    public static remove(container: IsMap | IsList, key: string): boolean {
        if (isMap(container)) {
            const index = container.keys.indexOf(key);
            if (index < 0) return false;
            container.keys.splice(index, 1);
            delete container.children[key];
            container.meta.dirty = true;
            return true;
        }
        if (!/^\d+$/.test(key)) return false;
        const index = Number(key);
        if (index >= container.children.length) return false;
        container.children.splice(index, 1);
        container.meta.dirty = true;
        return true;
    }

    /**
     * Returns the child nodes of a container (map or list) in order.
     * @param container - The container node (map or list).
     * @returns An array of child nodes in order.
     */
    public static childValues(container: IsMap | IsList): IsNode[] {
        return orderedChildren(container);
    }

    /**
     * Point mutation of a map entry: replace/update/append. Returns the attached node or `null` if the key is not a valid string.
     * @param container - The map container.
     * @param key - The key of the entry to replace/update/append.
     * @param value - The new value to set at the specified key.
     * @param ctx - The path context, including indentation unit and root node.
     * @returns The attached node at the specified key, or `null` if the key is not a valid string.
     * @throws If the key is not a valid string (empty or containing whitespace).
     */
    protected static putMap(container: IsMap, key: string, value: JsonValue | IsNode, ctx: Pathing.PathContext): IsNode {
        const entryBase = Factory.entryIndent(container, ctx.unit, ctx.root === container);
        const index = container.keys.indexOf(key);
        if (index >= 0) {
            const old = container.children[key];
            if (isNode(value)) {
                const cloned = Factory.clone(value);
                Factory.seat(cloned, old);
                Factory.reflow(cloned, ctx.unit);
                container.children[key] = cloned;
                container.meta.dirty = true;
                return cloned;
            }
            if (isScalar(old) && !Pathing.isObjectLike(value)) {
                old.value = value;
                old.meta.dirty = true;
                container.meta.dirty = true;
                return old;
            }
            const fresh = Factory.subtree(value, Factory.indentOf(old), Factory.childIndent(old, ctx.unit), ctx.unit, false);
            Factory.seat(fresh, old);
            Factory.reflow(fresh, ctx.unit);
            container.children[key] = fresh;
            container.meta.dirty = true;
            return fresh;
        }
        let child: IsNode;
        if (isNode(value)) {
            child = Factory.clone(value);
            Factory.reseat(child, entryBase);
            Factory.reflow(child, ctx.unit);
        } else child = Factory.subtree(value, entryBase, Factory.deeper(entryBase, ctx.unit), ctx.unit, false);
        Factory.seatKey(child, key);
        container.children[key] = child;
        container.keys.push(key);
        container.meta.dirty = true;
        return child;
    }

    /**
     * Point mutation of a list entry: replace/update/append. Returns the attached node or `null` if the key is not a valid index.
     * @param container - The list container.
     * @param key - The index of the entry to replace/update/append.
     * @param value - The new value to set at the specified index.
     * @param ctx - The path context, including indentation unit and root node.
     * @returns The attached node at the specified index, or `null` if the key is not a valid index.
     * @throws If the key is not a valid index (not a non-negative integer).
     */
    protected static putList(container: IsList, key: string, value: JsonValue | IsNode, ctx: Pathing.PathContext): IsNode | null {
        if (!/^\d+$/.test(key)) return null;
        const index = Number(key);
        const entryBase = Factory.entryIndent(container, ctx.unit, ctx.root === container);
        if (index < container.children.length) {
            const old = container.children[index];
            if (isNode(value)) {
                const cloned = Factory.clone(value);
                Factory.seat(cloned, old);
                Factory.reflow(cloned, ctx.unit);
                container.children[index] = cloned;
                container.meta.dirty = true;
                return cloned;
            }
            if (isScalar(old) && !Pathing.isObjectLike(value)) {
                old.value = value;
                old.meta.dirty = true;
                container.meta.dirty = true;
                return old;
            }
            const fresh = Factory.subtree(value, Factory.indentOf(old), Factory.childIndent(old, ctx.unit), ctx.unit, true);
            Factory.seat(fresh, old);
            Factory.reflow(fresh, ctx.unit);
            container.children[index] = fresh;
            container.meta.dirty = true;
            return fresh;
        }
        while (container.children.length < index) {
            container.children.push(Factory.scalar(null, 'plain', null, [], Factory.entryMeta(`${entryBase}- `)));
        }
        let child: IsNode;
        if (isNode(value)) {
            child = Factory.clone(value);
            const childIsContainer = isContainer(child);
            Factory.reseat(child, childIsContainer ? `${entryBase}-` : `${entryBase}- `);
            Factory.reflow(child, ctx.unit);
        } else child = Factory.subtree(value, entryBase, Factory.deeper(entryBase, ctx.unit), ctx.unit, true);
        container.children.push(child);
        container.meta.dirty = true;
        return child;
    }

    /**
     * Determines whether a value is object-like (i.e., not null and of type 'object').
     * @param value - The value to check.
     * @returns True if the value is object-like; false otherwise.
     */
    protected static isObjectLike(value: unknown): value is object {
        return value !== null && typeof value === 'object';
    }
}

export namespace Pathing {
    export interface PathContext {
        unit: number;
        root: IsNode | null;
    }
}

export default Pathing;