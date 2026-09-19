/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Line-oriented parser for a strict block-style YAML subset, preserving source formatting metadata.
 * @license Apache-2.0
 */

import ScalarUtils from './ScalarUtils.js';
import AST, { Node, MapNode, ListNode, ScalarNode, DocumentNode } from './AST.js';
import YamlError from './YamlError.js';

export class Parser {
    private static readonly BLOCK_HEADER = /^(?:\||>)([+-]?)(\d?)([+-]?)$/;

    private readonly vLines: string[];

    public constructor(text: string) {
        if (text.includes('\r')) throw new YamlError('CRLF line endings are not supported', { unsupported: true });
        this.vLines = text.split('\n');
    }

    public static parse(text: string): DocumentNode { return new Parser(text).parseDocument(); }

    public parseDocument(): DocumentNode {
        const header: string[] = [];
        let i = 0;
        while (i < this.vLines.length) {
            const trimmed = this.vLines[i].replace(/\s+$/, '');
            if (trimmed === '' || trimmed.startsWith('#') || trimmed === '---') { header.push(this.vLines[i++]); continue; }
            if (trimmed.startsWith('%')) throw new YamlError('Directives are not supported', { line: i + 1, unsupported: true });
            break;
        }
        const parsed = this.parseNode(i, -1);
        const footer: string[] = [];
        for (let j = parsed.next; j < this.vLines.length; j++) {
            const trimmed = this.vLines[j].replace(/\s+$/, '');
            if (trimmed === '' || trimmed.startsWith('#') || trimmed === '...') { footer.push(this.vLines[j]); continue; }
            if (trimmed === '---') throw new YamlError('Multi-document files are not supported', { line: j + 1, unsupported: true });
            throw new YamlError('Unexpected content after document root', { line: j + 1, unsupported: true });
        }

        const root = parsed.node;
        if (root instanceof MapNode) {
            const first = root.items[0];
            const hasComment = first !== undefined && first.lead.some(line => line.trim().startsWith('#'));
            if (first !== undefined && !hasComment && header.length > 0) {
                // Comments at the very top belong to the document header — re-attach the trailing
                // contiguous comment block to the first key so it documents the field in editors.
                let end = header.length;
                while (end > 0 && header[end - 1].trim() === '') end--;
                let start = end;
                while (start > 0 && header[start - 1].trim().startsWith('#')) start--;
                if (end > start) first.lead = [...header.splice(start, end - start), ...first.lead];
            }
        }

        return new DocumentNode(this.detectUnit(), header, root, footer);
    }

    private detectUnit(): number {
        const counts = new Map<number, number>();
        let previous = 0;
        for (const line of this.vLines) {
            const trimmed = line.replace(/\s+$/, '');
            if (trimmed === '' || trimmed.replace(/^ */, '').startsWith('#')) continue;
            const indent = line.length - line.replace(/^ */, '').length;
            if (indent > previous) counts.set(indent - previous, (counts.get(indent - previous) ?? 0) + 1);
            previous = indent;
        }
        let best = 2, bestCount = 0;
        for (const [width, count] of counts) if (count > bestCount) { best = width; bestCount = count; }
        return Math.max(1, Math.min(best, 8));
    }

    private lineInfo(index: number): Parser.LineInfo | null {
        if (index >= this.vLines.length) return null;
        const raw = this.vLines[index];
        const indentMatch = raw.match(/^ */);
        const indent = indentMatch ? indentMatch[0].length : 0;
        const text = raw.slice(indent).replace(/\s+$/, '');
        if (text === '' || text.startsWith('#')) return null;
        return { index, indent, text };
    }

    private nextContent(from: number): Parser.LineInfo | null {
        for (let i = from; i < this.vLines.length; i++) {
            const info = this.lineInfo(i);
            if (info) return info;
        }
        return null;
    }

    private parseNode(index: number, floor: number, virtual?: Parser.LineInfo): Parser.ParsedNode {
        if (virtual) {
            if (Parser.isDashEntry(virtual.text)) return this.parseList(index, floor, virtual);
            if (Parser.findKeyColon(virtual.text) !== -1) return this.parseMap(index, floor, virtual);
            return { node: this.scalarNode(null, 'plain'), next: index };
        }
        const probe = this.nextContent(index);
        if (!probe) return { node: this.scalarNode(null, 'plain'), next: index };
        if (Parser.isDashEntry(probe.text)) return this.parseList(index, floor);
        if (Parser.findKeyColon(probe.text) !== -1) return this.parseMap(index, floor);
        return this.parseStandaloneScalar(probe, floor);
    }

    private parseMap(index: number, floor: number, virtual?: Parser.LineInfo): Parser.ParsedNode {
        const items: Node[] = [];
        let i = index, first = true;
        while (i < this.vLines.length) {
            const leadStart = i;
            const lead: string[] = [];
            let info = first && virtual ? virtual : null;
            if (!info) {
                while (i < this.vLines.length) {
                    const probe = this.lineInfo(i);
                    if (!probe) { lead.push(this.vLines[i++]); continue; }
                    info = probe;
                    break;
                }
            }
            if (!info) return { node: this.finishMap(items, virtual?.indent), next: leadStart };
            if ((!first || !virtual) && (info.indent <= floor || Parser.isDashEntry(info.text))) return { node: this.finishMap(items, virtual?.indent), next: lead.length > 0 ? leadStart : info.index };
            const colon = Parser.findKeyColon(info.text);
            if (colon === -1) return { node: this.finishMap(items, virtual?.indent), next: lead.length > 0 ? leadStart : info.index };
            const token = info.text.slice(0, colon);
            const { key } = Parser.readToken(token, info.index);
            let cursor = colon + 1;
            while (cursor < info.text.length && (info.text[cursor] === ' ' || info.text[cursor] === '\t')) cursor++;
            const sep = info.text.slice(colon, cursor);
            const rawLine = this.vLines[info.index];
            const prefix = rawLine.slice(0, info.indent);
            const scanned = Parser.scanValue(rawLine.slice(info.indent + cursor), info.index);
            const valueResult = this.parseValueOnLine(scanned.value, info, info.indent, info.index + 1);
            const node = valueResult.node;
            node.lead = lead;
            node.prefix = prefix;
            node.token = token;
            node.sep = sep;
            node.rest = scanned.rest;
            node.inline = scanned.inline;
            node.wrapped = false;
            node.key = key;
            items.push(node);
            i = valueResult.next;
            first = false;
        }
        return { node: this.finishMap(items, virtual?.indent), next: i };
    }

    private parseList(index: number, floor: number, virtual?: Parser.LineInfo): Parser.ParsedNode {
        const items: Node[] = [];
        let i = index, first = true;
        while (i < this.vLines.length) {
            const leadStart = i;
            const lead: string[] = [];
            let info = first && virtual ? virtual : null;
            if (!info) {
                while (i < this.vLines.length) {
                    const probe = this.lineInfo(i);
                    if (!probe) { lead.push(this.vLines[i]); i++; continue; }
                    info = probe;
                    break;
                }
            }
            if (!info) return { node: this.finishList(items, virtual?.indent), next: leadStart };
            if ((!first || !virtual) && (info.indent <= floor || !Parser.isDashEntry(info.text))) return { node: this.finishList(items, virtual?.indent), next: lead.length > 0 ? leadStart : info.index };
            const dashMatch = info.text.match(/^-( *)/);
            if (!dashMatch) return { node: this.finishList(items, virtual?.indent), next: lead.length > 0 ? leadStart : info.index };
            const contentOffset = dashMatch[0].length;
            const content = info.text.slice(contentOffset);
            const rawLine = this.vLines[info.index];
            const rawIndentMatch = rawLine.match(/^ */);
            const lineIndent = rawIndentMatch ? rawIndentMatch[0].length : 0;
            const prefix = first && virtual ? rawLine.slice(0, info.indent) + (Parser.isDashEntry(info.text) ? dashMatch[0] : '') : `${' '.repeat(lineIndent)}-${dashMatch[1]}`;
            const virtualLine: Parser.LineInfo = { index: info.index, indent: lineIndent + contentOffset, text: content };
            let valueResult: Parser.ParsedNode;
            if (content === '') {
                const deeper = this.nextContent(info.index + 1);
                if (deeper && deeper.indent > lineIndent) valueResult = this.parseNode(info.index + 1, lineIndent);
                else valueResult = { node: this.scalarNode(null, 'plain'), next: info.index + 1 };
                valueResult.node.rest = rawLine.slice(info.indent + contentOffset);
            } else if (Parser.findKeyColon(content) !== -1) {
                valueResult = this.parseMap(info.index, lineIndent, virtualLine);
            } else if (Parser.isDashEntry(content)) {
                valueResult = this.parseList(info.index, lineIndent, virtualLine);
            } else {
                const scanned = Parser.scanValue(rawLine.slice(info.indent + contentOffset), info.index);
                valueResult = this.parseValueOnLine(scanned.value, virtualLine, lineIndent, info.index + 1);
                valueResult.node.rest = scanned.rest;
                valueResult.node.inline = scanned.inline;
            }
            const entry = valueResult.node;
            entry.lead = lead;
            entry.prefix = prefix;
            entry.token = '';
            entry.sep = '';
            entry.key = '';
            entry.wrapped = content !== '' && (Parser.findKeyColon(content) !== -1 || Parser.isDashEntry(content));
            items.push(entry);
            i = valueResult.next;
            first = false;
        }
        return { node: this.finishList(items, virtual?.indent), next: i };
    }

    /** Builds a finished map container, deriving the child-entry indentation from the parsed items. */
    private finishMap(items: Node[], virtualIndent?: number): MapNode {
        let base = '';
        if (items.length >= 2) base = AST.indentOf(items[1]);
        else if (items.length === 1) base = virtualIndent !== undefined ? ' '.repeat(virtualIndent) : AST.indentOf(items[0]);
        return new MapNode(items, '', base, false);
    }

    /** Builds a finished list container, deriving the child-entry indentation from the parsed items. */
    private finishList(items: Node[], virtualIndent?: number): ListNode {
        let base = '';
        if (items.length >= 2) base = AST.indentOf(items[1]);
        else if (items.length === 1) base = virtualIndent !== undefined ? ' '.repeat(virtualIndent) : AST.indentOf(items[0]);
        return new ListNode(items, '', base, false);
    }

    private parseValueOnLine(rest: string, info: Parser.LineInfo, containerIndent: number, followFrom: number): Parser.ParsedNode {
        if (rest === '') {
            const deeper = this.nextContent(followFrom);
            if (deeper) {
                const sameLevelSequence = deeper.indent === info.indent && Parser.isDashEntry(deeper.text);
                if (deeper.indent > info.indent || sameLevelSequence) return this.parseNode(followFrom, sameLevelSequence ? info.indent - 1 : info.indent);
            }
            return { node: this.scalarNode(null, 'plain'), next: followFrom };
        }
        if (Parser.BLOCK_HEADER.test(rest)) return this.parseBlockScalar(rest, containerIndent, info.index, followFrom);
        if (rest === '{}') {
            this.guardNoContinuation(followFrom, info.indent);
            return { node: new MapNode([], '', ' '.repeat(containerIndent + 2), false), next: followFrom };
        }
        if (rest === '[]') {
            this.guardNoContinuation(followFrom, info.indent);
            return { node: new ListNode([], '', ' '.repeat(containerIndent + 2), false), next: followFrom };
        }
        if (rest.startsWith('{') || rest.startsWith('[')) throw new YamlError('Non-empty flow collections are not supported', { line: info.index + 1, unsupported: true });
        const scalar = Parser.parseInlineScalar(rest, info.index);
        this.guardNoContinuation(followFrom, info.indent);
        return { node: scalar, next: followFrom };
    }

    private parseStandaloneScalar(info: Parser.LineInfo, floor: number): Parser.ParsedNode {
        const rawLine = this.vLines[info.index];
        const prefix = rawLine.slice(0, info.indent);
        if (Parser.BLOCK_HEADER.test(info.text)) {
            const block = this.parseBlockScalar(info.text, info.indent, info.index, info.index + 1);
            block.node.prefix = prefix;
            block.node.rest = rawLine.slice(prefix.length);
            return { node: block.node, next: block.next };
        }
        if (info.text === '{}') {
            this.guardNoContinuation(info.index + 1, info.indent);
            const node = new MapNode([], prefix, '', false);
            node.rest = rawLine.slice(prefix.length);
            return { node, next: info.index + 1 };
        }
        if (info.text === '[]') {
            this.guardNoContinuation(info.index + 1, info.indent);
            const node = new ListNode([], prefix, '', false);
            node.rest = rawLine.slice(prefix.length);
            return { node, next: info.index + 1 };
        }
        if (info.text.startsWith('{') || info.text.startsWith('[')) throw new YamlError('Non-empty flow collections are not supported', { line: info.index + 1, unsupported: true });
        const scalar = Parser.parseInlineScalar(info.text, info.index);
        scalar.prefix = prefix;
        scalar.rest = rawLine.slice(prefix.length);
        this.guardNoContinuation(info.index + 1, info.indent);
        return { node: scalar, next: info.index + 1 };
    }

    private guardNoContinuation(from: number, indent: number): void {
        const deeper = this.nextContent(from);
        if (deeper && deeper.indent > indent) throw new YamlError('Multiline plain or quoted scalars are not supported', { line: deeper.index + 1, unsupported: true });
    }

    private parseBlockScalar(header: string, containerIndent: number, headerIndex: number, from: number): Parser.ParsedNode {
        const match = header.match(Parser.BLOCK_HEADER);
        if (!match || match[2] !== '') throw new YamlError('Block scalar explicit indentation indicators are not supported', { line: headerIndex + 1, unsupported: true });
        const style: AST.ScalarStyle = header.startsWith('|') ? 'literal' : 'folded';
        const chomp = (match[1] === '-' || match[3] === '-') ? '-' : (match[1] === '+' || match[3] === '+') ? '+' : null;
        const body: string[] = [];
        let contentIndent = -1;
        let i = from;
        while (i < this.vLines.length) {
            const raw = this.vLines[i];
            const trimmed = raw.replace(/\s+$/, '');
            const rawIndent = raw.length - raw.replace(/^ */, '').length;
            if (trimmed === '') { body.push(raw); i++; continue; }
            if (rawIndent <= containerIndent) break;
            if (contentIndent === -1) contentIndent = rawIndent;
            if (rawIndent < contentIndent) break;
            body.push(raw);
            i++;
        }
        const stripped = body.map(line => contentIndent === -1 ? '' : line.slice(Math.min(contentIndent, line.length)));
        let trailingBlanks = 0;
        for (let j = stripped.length - 1; j >= 0 && stripped[j].trim() === ''; j--) trailingBlanks++;
        let value = '';
        if (contentIndent !== -1) {
            const content = stripped.slice(0, stripped.length - trailingBlanks);
            if (style === 'literal') value = content.join('\n');
            else {
                const pieces: string[] = [];
                let pendingBreak = false;
                for (const line of content) {
                    if (line.trim() === '') { pendingBreak = true; continue; }
                    if (pieces.length > 0) pieces.push(pendingBreak ? '\n' : ' ');
                    pendingBreak = false;
                    pieces.push(line);
                }
                value = pieces.join('');
            }
            if (chomp !== '-') value += '\n';
        }
        return { node: new ScalarNode(value, style, chomp, body), next: i };
    }

    private scalarNode(value: AST.Primitive, style: AST.ScalarStyle): ScalarNode {
        return new ScalarNode(value, style);
    }

    private static isDashEntry(text: string): boolean {
        return text === '-' || /^-(?: |$)/.test(text);
    }

    private static findKeyColon(text: string): number {
        let quote: string | null = null;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (quote) {
                if (quote === "'" && char === "'" && text[i + 1] === "'") { i++; continue; }
                if (quote === '"' && char === '\\') { i++; continue; }
                if (char === quote) quote = null;
                continue;
            }
            if (char === "'" || char === '"') { quote = char; continue; }
            if (char === '#' && i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) return -1;
            if (char === ':' && (i + 1 === text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) return i;
        }
        return -1;
    }

    private static readToken(token: string, line: number): { key: string; quoted: boolean } {
        const trimmed = token.trim();
        if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
            const scalar = Parser.parseInlineScalar(trimmed, line);
            if (typeof scalar.value !== 'string') throw new YamlError('Quoted key must resolve to a string', { line: line + 1 });
            return { key: scalar.value, quoted: true };
        }
        return { key: trimmed, quoted: false };
    }

    private static scanValue(region: string, line: number): { value: string; rest: string; inline: string | null } {
        let quote: string | null = null;
        for (let i = 0; i < region.length; i++) {
            const char = region[i];
            if (quote) {
                if (quote === "'" && char === "'") {
                    if (region[i + 1] === "'") { i++; continue; }
                    quote = null;
                    continue;
                }
                if (quote === '"' && char === '\\') { i++; continue; }
                if (char === quote) quote = null;
                continue;
            }
            if (char === "'" || char === '"') { quote = char; continue; }
            if (char === '#' && i > 0 && (region[i - 1] === ' ' || region[i - 1] === '\t')) {
                const value = region.slice(0, i).trim();
                Parser.validatePlain(value, line);
                return { value, rest: region.slice(0, i), inline: region.slice(i) };
            }
        }
        if (quote) throw new YamlError('Unterminated quoted scalar', { line: line + 1, unsupported: true });
        const value = region.trim();
        Parser.validatePlain(value, line);
        return { value, rest: region, inline: null };
    }

    private static validatePlain(value: string, line: number): void {
        if (/^[&*!]/.test(value)) throw new YamlError(`Anchors, aliases and tags are not supported: ${value}`, { line: line + 1, unsupported: true });
    }

    private static parseInlineScalar(token: string, line: number): ScalarNode {
        if (token.startsWith("'")) {
            if (!token.endsWith("'") || token.length < 2) throw new YamlError('Unterminated single-quoted scalar', { line: line + 1, unsupported: true });
            const inner = token.slice(1, -1).replace(/''/g, "'");
            return new ScalarNode(inner, 'single');
        }
        if (token.startsWith('"')) {
            if (!token.endsWith('"') || token.length < 2) throw new YamlError('Unterminated double-quoted scalar', { line: line + 1, unsupported: true });
            return new ScalarNode(Parser.unescapeDouble(token.slice(1, -1), line), 'double');
        }
        return new ScalarNode(ScalarUtils.resolvePlain(token), 'plain');
    }

    private static unescapeDouble(inner: string, line: number): string {
        let out = '';
        for (let i = 0; i < inner.length; i++) {
            const char = inner[i];
            if (char !== '\\') { out += char; continue; }
            const next = inner[++i];
            switch (next) {
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case 'r': out += '\r'; break;
                case '0': out += '\0'; break;
                case '\\': out += '\\'; break;
                case '"': out += '"'; break;
                case '/': out += '/'; break;
                case 'u': {
                    const hex = inner.slice(i + 1, i + 5);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new YamlError('Invalid unicode escape in double-quoted scalar', { line: line + 1, unsupported: true });
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                    break;
                }
                default: throw new YamlError(`Unsupported escape sequence \\${next}`, { line: line + 1, unsupported: true });
            }
        }
        return out;
    }

    public static resolvePlain(token: string): AST.Primitive {
        return ScalarUtils.resolvePlain(token);
    }
}

export namespace Parser {
    export interface LineInfo {
        index: number;
        indent: number;
        text: string;
    }

    export interface ParsedNode {
        node: Node;
        next: number;
    }
}

export default Parser;
