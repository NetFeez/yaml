/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Adapts the YAML AST into plain JSON-compatible data and extracts preserved comments.
 * @license Apache-2.0
 */

import { AST } from './AST.js';
import { Node, MapNode, ListNode, ScalarNode, DocumentNode } from './AST.js';

export class Adapter {
    /** Renders a node (and its children) as plain JSON-compatible data. */
    public static toJson(node: Node | null): AST.JsonValue {
        return node ? node.value : null;
    }

    /** Builds a fresh value subtree from a plain JSON value (delegates to the AST factory). */
    public static fromValue(value: AST.JsonValue): MapNode | ListNode | ScalarNode {
        return AST.subtree(value, '', '', 2, false) as MapNode | ListNode | ScalarNode;
    }

    /**
     * Extracts the comment block preceding every map entry, keyed by dot path.
     * List entries are skipped; multi-line comments are joined with newlines.
     */
    public static comments(doc: DocumentNode): Record<string, string> {
        const out: Record<string, string> = {};
        if (doc.root) Adapter.collectComments(doc.root, '', out);
        return out;
    }

    private static collectComments(node: Node, path: string, out: Record<string, string>): void {
        if (!(node instanceof MapNode)) return;
        for (const child of node.items) {
            const childPath = path ? `${path}.${child.key}` : child.key;
            const lines: string[] = [];
            for (const line of child.lead) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#')) lines.push(trimmed.replace(/^#+\s?/, ''));
            }
            if (lines.length > 0) out[childPath] = lines.join('\n');
            Adapter.collectComments(child, childPath, out);
        }
    }
}

export namespace Adapter {}

export default Adapter;
