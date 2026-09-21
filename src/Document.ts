/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Document root of the editable YAML tree: carries the document-level metadata (indentation unit, header/footer lines) and the high-level operations of the former Compiler facade (dump, toJS, comments, sync, create).
 * Every wrapper in the tree is cached per document in a WeakMap, so repeated reads of the same contract return the same instance (`doc.get('a') === doc.children.a`); mutations write into the raw contracts, which the pipeline reads live.
 * @license Apache-2.0
 */

import {
    DOCUMENT, IsDocument, IsNode, IsMap, IsList, IsScalar, JsonValue, NodeType, matchesType,
    isMap, isList, isScalar,
} from './ast/Contracts.js';
import Factory from './ast/Factory.js';

import Pathing from './support/Pathing.js';
import toJS from './support/toJS.js';
import Comments from './support/Comments.js';

import Serializer from './core/Serializer.js';
import Synchronizer from './core/Synchronizer.js';
import YamlError from './YamlError.js';

import Node from './node/Node.js';
import MapNode from './node/MapNode.js';
import ListNode from './node/ListNode.js';
import ScalarNode from './node/ScalarNode.js';

export class Document implements IsDocument {
    public readonly [DOCUMENT]: true = true;

    private readonly vCache = new WeakMap<IsNode, Node>();

    public unit: number;
    public header: string[];

    /** The root branch of the document, as a cached wrapper view. */
    public root: Node;
    public footer: string[];

    /**
     * Creates a new Document from a raw contract payload, wrapping the root and caching wrapper views.
     * @param payload - The raw contract payload to wrap.
     */
    public constructor(payload: IsDocument) {
        this.unit = payload.unit;
        this.header = payload.header;
        this.footer = payload.footer;
        this.root = this.wrap(payload.root);
    }

    /**
     * Wraps a raw contract node in a cached wrapper view, returning the same instance for repeated reads of the
     * same contract. The wrapper is cached per document, so `doc.get('a') === doc.children.a` holds by identity.
     * @param contract - The raw contract node to wrap.
     * @returns A wrapper view over the contract node.
     */
    public wrap(contract: IsNode): Node {
        const cached = this.vCache.get(contract);
        if (cached) return cached;
        let wrapped: Node;
        if (isMap(contract)) wrapped = new MapNode(contract, this);
        else if (isList(contract)) wrapped = new ListNode(contract, this);
        else if (isScalar(contract)) wrapped = new ScalarNode(contract, this);
        else throw new YamlError(`Cannot wrap unknown contract type: ${JSON.stringify(contract)}`);
        this.vCache.set(contract, wrapped);
        return wrapped;
    }

    /** The branches of the document root, when it is a container. */
    public get children(): Record<string, Node> | Node[] | undefined {
        if (this.root instanceof MapNode) return this.root.children;
        if (this.root instanceof ListNode) return this.root.children;
        return undefined;
    }

    /** The plain value of the document: a deep JSON projection of the root. Assigning replaces the root. */
    public get value(): JsonValue { return this.root.value; }
    public set value(value: JsonValue) { this.root = this.wrap(Factory.subtree(value, '', '', this.unit, false)); }

    /**
     * Deep-copies this document (content and entry fields) into an independent document.
     * @returns A new Document with a fresh copy of the content and entry fields.
     */
    public clone(): Document {
        return new Document({
            [DOCUMENT]: true,
            unit: this.unit,
            header: [...this.header],
            root: Factory.clone(this.root.contract),
            footer: [...this.footer],
        });
    }

    /**
     * Reads the node at a dot-separated path relative to the document root, or `null` when the path does not resolve.
     * @param path - The dot-separated path to read, with map keys and numeric list indices.
     * @returns The node at the path, or `null` when the path does not resolve.
     */
    public get(path: string): Node | null { return this.root.get(path); }

    /**
     * Point mutation at a dot-separated path relative to the document root, creating intermediate containers as
     * needed. A node argument is cloned (single-owner); an explicit `type` is validated before the mutation.
     * A scalar (or null) root is replaced by an empty map so navigation can begin.
     * @param path - The dot-separated path to mutate.
     * @param value - The value to attach, or a node to clone and attach.
     * @param type - An optional explicit kind the new value must match.
     * @returns The node attached at the leaf, or `null` when the navigation was not possible.
     */
    public set(path: string, value: JsonValue | Node, type?: NodeType): Node | null {
        if (type) {
            const prospective = value instanceof Node ? value.contract : Factory.subtree(value, '', '', this.unit, false);
            if (!matchesType(prospective, type)) throw new YamlError(`Value for path "${path}" is not of expected type "${type}"`);
        }
        let rootContract: IsMap | IsList;
        if (!isMap(this.root.contract) && !isList(this.root.contract)) {
            rootContract = Factory.map([]);
            this.root = this.wrap(rootContract);
        } else rootContract = this.root.contract;
        
        const raw = value instanceof Node ? value.contract : value;
        const node = Pathing.setPath(rootContract, path.split('.'), raw, { unit: this.unit, root: rootContract });
        return node ? this.wrap(node) : null;
    }

    /**
     * Deletes the node at a dot-separated path relative to the document root, returning whether the deletion was
     * successful. Deleting the root is not allowed.
     * @param path - The dot-separated path to delete, with map keys and numeric list indices.
     * @returns `true` if a node was deleted, or `false` when the path did not resolve.
     */
    public delete(path: string): boolean {
        return Pathing.deletePath(this.root.contract, path);
    }

    /**
     * Reads the node at a dot-separated path restricted to a map, or `null` otherwise.
     * @param path - The dot-separated path to read, with map keys and numeric list indices.
     * @returns The map node at the path, or `null` when the path does not resolve to a map.
     */
    public getMap(path: string): MapNode | null {
        const node = this.get(path);
        return node instanceof MapNode ? node : null;
    }

    /**
     * Reads the node at a dot-separated path restricted to a list, or `null` otherwise.
     * @param path - The dot-separated path to read, with map keys and numeric list indices.
     * @returns The list node at the path, or `null` when the path does not resolve to a list.
     */
    public getList(path: string): ListNode | null {
        const node = this.get(path);
        return node instanceof ListNode ? node : null;
    }

    /**
     * Reads the node at a dot-separated path restricted to a numeric scalar, or `null` otherwise.
     * @param path - The dot-separated path to read, with map keys and numeric list indices.
     * @returns The number value at the path, or `null` when the path does not resolve to a numeric scalar.
     */
    public getNumber(path: string): number | null {
        const node = this.get(path);
        if (!node || !isScalar(node.contract) || typeof node.contract.value !== 'number') return null;
        return node.contract.value;
    }

    /**
     * Sets a leading comment on the field's entry line at a dot-separated path, re-rendering the entry so the comment is emitted. A comment already starting with `#` is used as-is.
     * @param path - The dot-separated path to set the comment on, with map keys and numeric list indices.
     * @param comment - The comment text to set, with or without a leading `#`.
     * @param autoIndent - Whether to automatically indent the comment to the field's entry indentation.
     * @throws YamlError when the path does not resolve to an existing field.
     */
    public addCommentBefore(path: string, comment: string, autoIndent = true): void {
        const node = this.get(path);
        if (!node) throw new YamlError(`No field found at comment path "${path}"`);
        const text = comment.startsWith('#') ? comment : `# ${comment}`;
        node.meta.lead.push(autoIndent ? `${Factory.indentOf(node.contract)}${text}` : text);
    }

    /**
     * Sets an inline comment on the field's entry line at a dot-separated path, re-rendering the entry so the comment is emitted. A comment already starting with `#` is used as-is.
     * @param path - The dot-separated path to set the comment on, with map keys and numeric list indices.
     * @param comment - The comment text to set, with or without a leading `#`.
     * @throws YamlError when the path does not resolve to an existing field.
     */
    public addCommentAfter(path: string, comment: string): void {
        const node = this.get(path);
        if (!node) throw new YamlError(`No field found at comment path "${path}"`);
        node.meta.inline = comment.startsWith('#') ? comment : `# ${comment}`;
        node.meta.dirty = true;
    }

    /**
     * Serializes the document back to YAML text, byte-for-byte where nothing was modified.
     * @returns The YAML text representation of the document.
     */
    public dump(): string {
        return Serializer.dump(this);
    }

    /**
     * Renders the document payload as plain JSON-compatible data.
     * @returns The JSON representation of the document.
     */
    public toJS(): JsonValue {
        return toJS(this.root.contract);
    }

    /**
     * Extracts the comment block preceding every map entry of the document, keyed by dot path.
     * @returns A record of comment blocks keyed by their dot paths.
     */
    public comments(): Record<string, string> {
        return Comments.comments(this);
    }

    /**
     * Synchronizes the document payload against a plain JSON value, preserving untouched formatting.
     * @param value - The JSON value to synchronize against.
     */
    public sync(value: JsonValue): void {
        const payload: IsDocument = {
            [DOCUMENT]: true,
            unit: this.unit,
            header: this.header,
            root: this.root.contract,
            footer: this.footer,
        };
        const rootContract = Synchronizer.sync(payload, value);
        this.root = this.wrap(rootContract);
    }
}

export namespace Document {}

export default Document;