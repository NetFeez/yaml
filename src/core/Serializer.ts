/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Serializer that re-emits untouched contract subtrees byte-for-byte and renders modified nodes with minimal quoting.
 * Works exclusively against contract shapes (guards + `meta`), so it accepts both raw contracts and the wrapper classes that mirror them.
 * @license Apache-2.0
 */

import { IsDocument, IsNode, IsMap, IsList, orderedChildren, isScalar, isMap, isList } from '../ast/Contracts.js';

import ScalarUtils from '../support/ScalarUtils.js';

import YamlError from '../YamlError.js';

export class Serializer {
    /**
     * Dumps a document payload back to YAML text, byte-for-byte where nothing was modified.
     * @param doc - The document payload to serialize.
     * @returns The YAML string.
     */
    public static dump(doc: IsDocument): string {
        const lines: string[] = [...doc.header];
        lines.push(...Serializer.emitNode(doc.root));
        lines.push(...doc.footer);
        return lines.join('\n');
    }

    /**
     * Emits the lines of a node subtree: scalars replay or re-render their bytes, containers emit their own entry line and recurse into their children.
     * @param node - The node to emit.
     * @returns The YAML lines of the subtree.
     */
    private static emitNode(node: IsNode): string[] {
        if (isScalar(node)) {
            if (node.meta.dirty) return [ScalarUtils.render(node.value)];
            const line = node.meta.prefix + node.meta.token + node.meta.sep + node.meta.rest + (node.meta.inline ?? '');
            if (line === '' && node.body.length === 0) return [];
            const out = [line];
            out.push(...node.body);
            return out;
        }
        const container = Serializer.asContainer(node);
        const children = orderedChildren(container);
        if (children.length === 0 && container.meta.dirty) return [isMap(container) ? '{}' : '[]'];
        const out: string[] = [];
        const line = node.meta.prefix + node.meta.token + node.meta.sep + node.meta.rest + (node.meta.inline ?? '');
        if (line !== '') out.push(line);
        out.push(...children.flatMap(child => Serializer.emitEntry(child)));
        return out;
    }

    /**
     * Emits the lines of a node's entry: lead comments, the own line (with an inline comment when it fits) and the child lines.
     * @param node - The node whose entry to emit.
     * @returns The YAML lines of the entry.
     */
    private static emitEntry(node: IsNode): string[] {
        const out: string[] = [...node.meta.lead];
        if (!isScalar(node)) {
            const container = Serializer.asContainer(node);
            const children = orderedChildren(container);
            const inline = children.length > 0 && node.meta.inline ? null : node.meta.inline;
            if (inline === null && node.meta.inline) out.push(`${Serializer.indentOf(node)}${node.meta.inline}`);
            if (node.meta.wrapped) {
                if (!node.meta.dirty) {
                    out.push(...children.flatMap(child => Serializer.emitEntry(child)));
                    return out;
                }
                const first = children[0];
                const covers = first !== undefined && first.meta.prefix.includes('-');
                if (!covers) out.push(node.meta.prefix.trimEnd());
                out.push(...children.flatMap(child => Serializer.emitEntry(child)));
                return out;
            }
            if (!node.meta.dirty) {
                out.push(node.meta.prefix + node.meta.token + node.meta.sep + node.meta.rest + (inline ?? ''));
                if (children.length > 0) out.push(...children.flatMap(child => Serializer.emitEntry(child)));
                return out;
            }
            let line = node.meta.prefix + node.meta.token + node.meta.sep;
            if (children.length === 0) line = Serializer.inlineSep(line.trimEnd()) + (isMap(node) ? '{}' : '[]');
            else line = line.trimEnd();
            if (inline) line += ` ${inline}`;
            out.push(line);
            out.push(...children.flatMap(child => Serializer.emitEntry(child)));
            return out;
        }
        if (!node.meta.dirty) {
            out.push(node.meta.prefix + node.meta.token + node.meta.sep + node.meta.rest + (node.meta.inline ?? ''));
            out.push(...node.body);
            return out;
        }
        let line = node.meta.prefix + node.meta.token + node.meta.sep;
        line = Serializer.inlineSep(line) + ScalarUtils.render(node.value);
        if (node.meta.inline) line += ` ${node.meta.inline}`;
        out.push(line);
        return out;
    }

    /**
     * Narrows any non-scalar node to its container contract, failing loudly if the node-kind invariant breaks.
     * @param node - The node to narrow.
     * @returns The narrowed container node.
     */
    private static asContainer(node: IsNode): IsMap | IsList {
        if (isMap(node)) return node;
        if (isList(node)) return node;
        throw new YamlError('Expected a map or list node in Serializer');
    }

    private static inlineSep(line: string): string {
        return line.length > 0 && !/\s$/.test(line) ? `${line} ` : line;
    }

    /** Reads the leading indentation of a node's own entry line. */
    private static indentOf(node: IsNode): string {
        const match = node.meta.prefix.match(/^ */);
        return match ? match[0] : '';
    }
}

export namespace Serializer {}

export default Serializer;