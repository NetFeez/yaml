/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Extracts the comment block preceding every map entry of a document payload, keyed by dot path.
 * @license Apache-2.0
 */

import { IsDocument, IsNode, isMap } from '../ast/Contracts.js';

export class Comments {
    /**
     * Extracts the comment block preceding every map entry of a document payload, keyed by dot path.
     * @param doc - The document to extract comments from.
     * @returns A record of comment blocks keyed by their dot paths.
     */
    public static comments(doc: IsDocument): Record<string, string> {
        const out: Record<string, string> = {};
        Comments.collectComments(doc.root, '', out);
        return out;
    }

    /**
     * Recursively collects comment blocks from a node and its children, populating the output record with dot paths as keys.
     * @param node - The current node to process.
     * @param path - The dot path leading to the current node.
     * @param out - The output record to populate with comment blocks.
     */
    protected static collectComments(node: IsNode, path: string, out: Record<string, string>): void {
        if (!isMap(node)) return;
        for (const key of node.keys) {
            const child = node.children[key];
            if (!child) continue;
            const childPath = path ? `${path}.${key}` : key;
            const lines: string[] = [];
            for (const line of child.meta.lead) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#')) lines.push(trimmed.replace(/^#+\s?/, ''));
            }
            if (lines.length > 0) out[childPath] = lines.join('\n');
            Comments.collectComments(child, childPath, out);
        }
    }
}

export namespace Comments {}

export default Comments;