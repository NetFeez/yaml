/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Wrapper view over a raw contract node, cached per document so identity holds (`doc.get('a') === doc.children.a`).
 * Mutations write into the underlying contract, which the pipeline (dump/sync/toJS) reads live — the classes are a convenient, droppable face; the contracts are the single source of truth.
 * @license Apache-2.0
 */

import {
    isContainer, isList, isMap, isScalar, IsNode, JsonValue,
    matchesType, Metadata, NODE, NodeType,
} from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';

import Pathing from '../support/Pathing.js';
import toJS from '../support/toJS.js';

import YamlError from '../YamlError.js';

import type Document from '../Document.js';
import type ListNode from './ListNode.js';
import type MapNode from './MapNode.js';

export abstract class Node implements IsNode {
    public readonly [NODE]: true = true;

    protected readonly vNode: IsNode;
    protected readonly vDocument: Document;

    protected constructor(node: IsNode, document: Document) {
        this.vNode = node;
        this.vDocument = document;
    }

    public get contract(): IsNode { return this.vNode; }
    public get meta(): Metadata { return this.vNode.meta; }
    public get children(): Record<string, Node> | Node[] | undefined { return undefined; }

    /**
     * The plain value of this node: the scalar primitive, or a deep JSON projection of a container.
     * Assigning replaces the value in place (a scalar updates its primitive and marks itself dirty; a container
     * rebuilds its branches at its own entry indentation, keeping position and comments).
     */
    public abstract get value(): JsonValue;
    public abstract set value(value: JsonValue);

    /**
     * Clones this node, returning a new Node wrapper over a cloned contract.
     * @returns A new Node wrapper over a cloned contract.
     */
    public abstract clone(): Node;

    /** Projects this node (and its branches) to plain JSON data. */
    public toJS(): JsonValue { return toJS(this.vNode); }

    /**
     * Reads the child at a dot-separated path relative to this node, or `null` if the navigation was not possible.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist.
     */
    public get(path: string): Node | null {
        const node = Pathing.resolve(this.vNode, path);
        return node ? this.vDocument.wrap(node) : null;
    }

    /**
     * Point mutation at a dot-separated path relative to this node, creating intermediate containers as needed.
     * A node argument is cloned (single-owner); an explicit `type` is validated before the mutation.
     * Navigation can only begin from a container: calling `set()` on a scalar leaves the tree untouched.
     * @param path - The dot-separated path to mutate.
     * @param value - The value to attach, or a node to clone and attach.
     * @param type - An optional explicit kind the new value must match.
     * @returns The node attached at the leaf, or `null` when the navigation was not possible.
     */
    public set(path: string, value: JsonValue | Node, type?: NodeType): Node | null {
        const container = this.vNode;
        if (!isContainer(container)) return null;
        if (type) {
            const prospective = value instanceof Node ? value.contract : Factory.subtree(value, '', '', this.vDocument.unit, false);
            if (!matchesType(prospective, type)) throw new YamlError(`Value for path "${path}" is not of expected type "${type}"`);
        }
        const raw = value instanceof Node ? value.contract : value;
        const node = Pathing.setPath(container, path.split('.'), raw, { unit: this.vDocument.unit, root: this.vDocument.root.contract });
        return node ? this.vDocument.wrap(node) : null;
    }

    /** 
     * Reads the child at a dot-separated path restricted to a map, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a map.
     */
    public getMap(path: string): MapNode | null {
        const node = this.get(path);
        return Node.isMapNode(node) ? node : null;
    }

    /**
     * Reads the child at a dot-separated path restricted to a list, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a list.
     */
    public getList(path: string): ListNode | null {
        const node = this.get(path);
        return Node.isListNode(node) ? node : null;
    }

    /**
     * Reads the child at a dot-separated path restricted to a numeric scalar, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a numeric scalar.
     */
    public getNumber(path: string): number | null {
        const node = this.get(path);
        if (!node || !isScalar(node.contract) || typeof node.contract.value !== 'number') return null;
        return node.contract.value;
    }

    /**
     * Reads the child at a dot-separated path restricted to a string scalar, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a string scalar.
     */
    public getString(path: string): string | null {
        const node = this.get(path);
        if (!node || !isScalar(node.contract) || typeof node.contract.value !== 'string') return null;
        return node.contract.value;
    }

    /**
     * Reads the child at a dot-separated path restricted to a boolean scalar, or `null` otherwise.
     * @param path - The dot-separated path to the child.
     * @returns The child node, or `null` if it doesn't exist or is not a boolean scalar.
     */
    public getBoolean(path: string): boolean | null {
        const node = this.get(path);
        if (!node || !isScalar(node.contract) || typeof node.contract.value !== 'boolean') return null;
        return node.contract.value;
    }

    /**
     * Deletes the child at a dot-separated path relative to this node, returning `true` if the deletion was successful.
     * @param path - The dot-separated path to the child.
     * @returns `true` if the deletion was successful, `false` otherwise.
     */
    public delete(path: string): boolean {
        return Pathing.deletePath(this.vNode, path);
    }

    /** 
     * Narrowing helper: a wrapped map (uses the existing `isMap` brand guard on the wrapper).
     * @param value - The value to check.
     * @returns `true` if the value is a map node, `false` otherwise.
     */
    protected static isMapNode(value: Node | null): value is MapNode {
        return isMap(value);
    }

    /**
     * Narrowing helper: a wrapped list (uses the existing `isList` brand guard on the wrapper).
     * @param value - The value to check.
     * @returns `true` if the value is a list node, `false` otherwise.
     */
    protected static isListNode(value: Node | null): value is ListNode {
        return isList(value);
    }
}

export namespace Node {}

export default Node;