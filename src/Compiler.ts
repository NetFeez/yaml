/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Facade for the YAML subset: parsing, serialization, plain-data compilation and structure-preserving synchronization.
 * @license Apache-2.0
 */

import { AST } from './AST.js';
import { DocumentNode } from './AST.js';
import Adapter from './Adapter.js';
import Parser from './Parser.js';
import Serializer from './Serializer.js';
import Synchronizer from './Synchronizer.js';

export class Compiler {
    /** Parses a YAML document, preserving source formatting metadata. */
    public static parse(text: string): DocumentNode {
        return Parser.parse(text);
    }

    /** Dumps the document tree back to YAML text. */
    public static dump(doc: DocumentNode): string {
        return Serializer.dump(doc);
    }

    /** Renders the document tree as plain JSON-compatible data; a raw YAML string is parsed first. */
    public static compile(doc: DocumentNode): AST.JsonValue;
    public static compile(text: string): AST.JsonValue;
    public static compile(input: string | DocumentNode): AST.JsonValue {
        const doc = typeof input === 'string' ? Parser.parse(input) : input;
        return Adapter.toJson(doc.root);
    }

    /**
     * Extracts the comment block preceding every map entry, keyed by dot path.
     * List entries are skipped; multi-line comments are joined with newlines.
     */
    public static comments(doc: DocumentNode): Record<string, string> {
        return Adapter.comments(doc);
    }

    /**
     * Synchronizes the document tree against a plain JSON value, preserving untouched formatting.
     * Maps gain, replace and drop keys; lists match by index truncating or extending; scalars update when they differ.
     */
    public static apply(doc: DocumentNode, json: AST.JsonValue): void {
        Synchronizer.apply(doc, json);
    }
}

export namespace Compiler {
    export type JsonValue = AST.JsonValue;
}

export default Compiler;
