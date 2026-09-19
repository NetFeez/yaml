/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Serializer that re-emits untouched AST subtrees byte-for-byte and renders modified nodes with minimal quoting.
 * @license Apache-2.0
 */

import { AST } from './AST.js';
import { Node, MapNode, ListNode, ScalarNode, DocumentNode } from './AST.js';
import ScalarUtils from './ScalarUtils.js';

export class Serializer {
    private readonly vDocument: DocumentNode;

    /**
     * Creates a new Serializer instance for the given AST document.
     * @param document - The AST document to serialize.
     */
    public constructor(document: DocumentNode) { this.vDocument = document; }

    /**
     * Dumps the AST document associated with this Serializer instance to a YAML string.
     * @returns The YAML string.
     */
    public dump(): string {
        const lines: string[] = [...this.vDocument.header];
        if (this.vDocument.root) lines.push(...Serializer.emitNode(this.vDocument.root));
        lines.push(...this.vDocument.footer);
        return lines.join('\n');
    }

    /**
     * Dumps the given AST document to a YAML string.
     * @param doc - The AST document to dump.
     * @returns The YAML string.
     */
    public static dump(doc: DocumentNode): string { return new Serializer(doc).dump(); }

    private static emitNode(node: Node): string[] {
        if (node instanceof ScalarNode) {
            if (node.dirty) return [ScalarUtils.render(node.value)];
            const out = [node.prefix + node.token + node.sep + node.rest + (node.inline ?? '')];
            out.push(...node.raw);
            return out;
        }
        const container = node as MapNode | ListNode;
        return container.items.flatMap(child => Serializer.emitEntry(child));
    }

    private static emitEntry(node: Node): string[] {
        const out: string[] = [...node.lead];
        const container = node as MapNode | ListNode;
        if (node.wrapped) {
            if (!node.dirty) {
                out.push(...container.items.flatMap(child => Serializer.emitEntry(child)));
                return out;
            }
            const first = container.items[0];
            const covers = first !== undefined && first.prefix.includes('-');
            if (!covers) out.push(node.prefix.trimEnd());
            out.push(...container.items.flatMap(child => Serializer.emitEntry(child)));
            return out;
        }
        if (!node.dirty) {
            out.push(node.prefix + node.token + node.sep + node.rest + (node.inline ?? ''));
            if (node instanceof ScalarNode) out.push(...node.raw);
            else if (container.items.length > 0) out.push(...container.items.flatMap(child => Serializer.emitEntry(child)));
            return out;
        }
        let line = node.prefix + node.token + node.sep;
        if (node instanceof ScalarNode) {
            if (node.raw.length === 0) line = Serializer.inlineSep(line) + ScalarUtils.render(node.value);
            if (node.inline) line += ` ${node.inline}`;
            out.push(line);
            out.push(...node.raw);
            return out;
        }
        if (container.items.length === 0) line = Serializer.inlineSep(line.trimEnd()) + (node instanceof MapNode ? '{}' : '[]');
        else line = line.trimEnd();
        if (node.inline) line += ` ${node.inline}`;
        out.push(line);
        out.push(...container.items.flatMap(child => Serializer.emitEntry(child)));
        return out;
    }

    private static inlineSep(line: string): string {
        return line.length > 0 && !/\s$/.test(line) ? `${line} ` : line;
    }
}

export namespace Serializer {}

export default Serializer;