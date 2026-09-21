/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Single public facade of the library, replacing the v1 `Compiler`.
 * parse builds a Document from text, dump serializes it back, toJS projects it, sync reconciles it, comments extracts preserved comment blocks and create()/create(value) build empty or seeded documents.
 * @license Apache-2.0
 */

import { DOCUMENT, IsDocument, JsonValue } from './ast/Contracts.js';
import Factory from './ast/Factory.js';

import Document from './Document.js';
import Parser from './core/Parser.js';

import toJS from './support/toJS.js';

export class Yaml {
    /**
     * Parses YAML text into an editable Document, preserving source formatting for lossless round-trips.
     * @param text - The YAML text to parse.
     * @returns A Document representing the parsed YAML tree.
     * @throws If the input text is not valid YAML.
     */
    public static parse(text: string): Document { return new Document(Parser.parse(text)); }

    /**
     * Serializes a Document back to YAML text, byte-for-byte where nothing was modified.
     * @param doc - The Document to serialize.
     * @returns The YAML text representation of the Document.
     */
    public static dump(doc: Document): string { return doc.dump(); }

    /**
     * Projects a Document (or YAML text) to plain JSON-compatible data.
     * @param doc - The Document or YAML text to project.
     * @returns A plain JSON-compatible value (object, array, string, number, boolean or null).
     * @throws If the input is a string and cannot be parsed as YAML.
     * @throws If the input is a Document and its root cannot be projected to JSON.
     */
    public static toJS(doc: Document | string): JsonValue {
        if (typeof doc === 'string') return toJS(new Document(Parser.parse(doc)).root.contract);
        return doc.toJS();
    }

    /**
     * Synchronizes a Document against a plain JSON value, preserving untouched formatting.
     * @param doc - The Document to synchronize.
     * @param value - The plain JSON value to synchronize against.
     * @returns Nothing; the Document is mutated in place.
     */
    public static sync(doc: Document, value: JsonValue): void { doc.sync(value); }

    /**
     * Extracts the comment block preceding every map entry of a Document, keyed by dot path.
     * @param doc - The Document to extract comments from.
     * @returns A record of comment blocks keyed by their dot paths.
     */
    public static comments(doc: Document): Record<string, string> { return doc.comments(); }

    /** Creates a Document with an empty map root. */
    public static create(): Document;
    /**
     * Creates a Document whose root is a fresh subtree for the given value (map, list or primitive).
     * @param value - The value to seed the document with; if omitted, the root is an empty map.
     * @returns A new Document with a fresh root for the given value.
     */
    public static create(value: JsonValue): Document;
    public static create(value?: JsonValue): Document {
        const empty = Factory.map([]);
        empty.meta.dirty = true; // an empty fresh root renders as `{}` instead of empty output
        const payload: IsDocument = {
            [DOCUMENT]: true,
            unit: 2,
            header: [],
            root: value === undefined ? empty : Factory.subtree(value, '', '', 2, false),
            footer: [],
        };
        return new Document(payload);
    }
}

export namespace Yaml {}

export default Yaml;