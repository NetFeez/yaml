/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Line-oriented parser for a strict block-style YAML subset, preserving source formatting metadata.
 * Produces a plain contract payload (`IsDocument`) so the rest of the pipeline never depends on Document or the wrapper classes.
 * @license Apache-2.0
 */

import { IsNode, IsMap, IsList, IsScalar, IsDocument, DOCUMENT, isMap, Primitive } from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';

import ScalarUtils from '../support/ScalarUtils.js';

import YamlError from '../YamlError.js';

export class Parser {
    private static readonly BLOCK_HEADER = /^(?:\||>)([+-]?)(\d?)([+-]?)$/;

    private readonly vLines: string[];

    /**
     * Creates a parser over the given YAML text; rejects CRLF line endings.
     * @param text - The YAML text to split into lines for parsing.
     * @throws If the text uses CRLF line endings (unsupported).
     */
    public constructor(text: string) {
        if (text.includes('\r')) throw new YamlError('CRLF line endings are not supported', { unsupported: true });
        this.vLines = text.split('\n');
    }

    /**
     * Parses the document: splits the raw lines into header and footer, parses the root node and re-attaches the trailing header comment block to the first key so it documents the field in editors.
     * @returns A plain document contract (`IsDocument`).
     * @throws If directives, multi-document content or trailing content are present.
     */
    public parseDocument(): IsDocument {
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
        if (isMap(root)) {
            const mapRoot = root;
            const firstKey = mapRoot.keys.length > 0 ? mapRoot.keys[0] : undefined;
            const first = firstKey !== undefined ? mapRoot.children[firstKey] : undefined;
            const hasComment = first !== undefined && first.meta.lead.some(line => line.trim().startsWith('#'));
            if (first !== undefined && !hasComment && header.length > 0) {
                let end = header.length;
                while (end > 0 && header[end - 1].trim() === '') end--;
                let start = end;
                while (start > 0 && header[start - 1].trim().startsWith('#')) start--;
                if (end > start) first.meta.lead = [...header.splice(start, end - start), ...first.meta.lead];
            }
        }

        return { [DOCUMENT]: true, unit: this.detectUnit(), header, root, footer };
    }

    /**
     * Detects the most frequent indentation step between successive content lines.
     * @returns The detected unit, clamped between 1 and 8 (default 2 when no step is measurable).
     */
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

    /**
     * Reads the structural info (index, indentation and text) of a content line at a given index.
     * @param index - The line index to read.
     * @returns The line info, or `null` for blank/comment lines and out-of-range indexes.
     */
    private lineInfo(index: number): Parser.LineInfo | null {
        if (index >= this.vLines.length) return null;
        const raw = this.vLines[index];
        const indentMatch = raw.match(/^ */);
        const indent = indentMatch ? indentMatch[0].length : 0;
        const text = raw.slice(indent).replace(/\s+$/, '');
        if (text === '' || text.startsWith('#')) return null;
        return { index, indent, text };
    }

    /**
     * Finds the first content line at or after a given index.
     * @param from - The line index to start from.
     * @returns The first content line info, or `null` when none remains.
     */
    private nextContent(from: number): Parser.LineInfo | null {
        for (let i = from; i < this.vLines.length; i++) {
            const info = this.lineInfo(i);
            if (info) return info;
        }
        return null;
    }

    /**
     * Parses the node starting at a content line, laid out above the given floor indentation; a virtual line forces the interpretation of a specific structural line.
     * @param index - The line index to start from.
     * @param floor - The indentation below which the node ends.
     * @param virtual - An optional structural line to parse directly.
     * @returns The parsed node and the index of the line after it.
     */
    private parseNode(index: number, floor: number, virtual?: Parser.LineInfo): Parser.ParsedNode {
        if (virtual) {
            if (Parser.isDashEntry(virtual.text)) return this.parseList(index, floor, virtual);
            if (Parser.findKeyColon(virtual.text) !== -1) return this.parseMap(index, floor, virtual);
            return { node: Factory.scalar(null, 'plain'), next: index };
        }
        const probe = this.nextContent(index);
        if (!probe) return { node: Factory.scalar(null, 'plain'), next: index };
        if (Parser.isDashEntry(probe.text)) return this.parseList(index, floor);
        if (Parser.findKeyColon(probe.text) !== -1) return this.parseMap(index, floor);
        return this.parseStandaloneScalar(probe, floor);
    }

    /**
     * Parses consecutive `key: value` entries until the indentation drops to the floor or a dash entry breaks the block.
     * @param index - The line index to start from.
     * @param floor - The indentation below which the map ends.
     * @param virtual - An optional first entry line.
     * @returns The finished map and the index of the line after it.
     * @throws If a duplicated mapping key is found.
     */
    private parseMap(index: number, floor: number, virtual?: Parser.LineInfo): Parser.ParsedNode {
        const items: IsNode[] = [];
        const seen = new Set<string>();
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
            if (seen.has(key)) throw new YamlError(`Duplicated mapping key "${key}"`, { line: info.index + 1 });
            seen.add(key);
            let cursor = colon + 1;
            while (cursor < info.text.length && (info.text[cursor] === ' ' || info.text[cursor] === '\t')) cursor++;
            const sep = info.text.slice(colon, cursor);
            const rawLine = this.vLines[info.index];
            const prefix = rawLine.slice(0, info.indent);
            const scanned = Parser.scanValue(rawLine.slice(info.indent + cursor), info.index);
            const valueResult = this.parseValueOnLine(scanned.value, info, info.indent, info.index + 1);
            const node = valueResult.node;
            node.meta.lead = lead;
            node.meta.prefix = prefix;
            node.meta.token = token;
            node.meta.sep = sep;
            node.meta.rest = scanned.rest;
            node.meta.inline = scanned.inline;
            node.meta.wrapped = false;
            node.meta.key = key;
            items.push(node);
            i = valueResult.next;
            first = false;
        }
        return { node: this.finishMap(items, virtual?.indent), next: i };
    }

    /**
     * Parses consecutive dash entries until the indentation drops to the floor or a non-dash line breaks the block; empty and nested items recurse.
     * @param index - The line index to start from.
     * @param floor - The indentation below which the list ends.
     * @param virtual - An optional first item line.
     * @returns The finished list and the index of the line after it.
     */
    private parseList(index: number, floor: number, virtual?: Parser.LineInfo): Parser.ParsedNode {
        const items: IsNode[] = [];
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
                else valueResult = { node: Factory.scalar(null, 'plain'), next: info.index + 1 };
                valueResult.node.meta.rest = rawLine.slice(info.indent + contentOffset);
            } else if (Parser.findKeyColon(content) !== -1) {
                valueResult = this.parseMap(info.index, lineIndent, virtualLine);
            } else if (Parser.isDashEntry(content)) {
                valueResult = this.parseList(info.index, lineIndent, virtualLine);
            } else {
                const scanned = Parser.scanValue(rawLine.slice(info.indent + contentOffset), info.index);
                valueResult = this.parseValueOnLine(scanned.value, virtualLine, lineIndent, info.index + 1);
                valueResult.node.meta.rest = scanned.rest;
                valueResult.node.meta.inline = scanned.inline;
            }
            const entry = valueResult.node;
            entry.meta.lead = lead;
            entry.meta.prefix = prefix;
            entry.meta.token = '';
            entry.meta.sep = '';
            entry.meta.key = '';
            entry.meta.wrapped = content !== '' && (Parser.findKeyColon(content) !== -1 || Parser.isDashEntry(content));
            items.push(entry);
            i = valueResult.next;
            first = false;
        }
        return { node: this.finishList(items, virtual?.indent), next: i };
    }

    /**
     * Builds a finished map container.
     * @param items - The items to include in the map.
     * @param _virtualIndent - The virtual indentation of the map.
     * @returns The finished map container.
     */
    private finishMap(items: IsNode[], _virtualIndent?: number): IsMap {
        return Factory.map(items);
    }

    /**
     * Builds a finished list container.
     * @param items - The items to include in the list.
     * @param _virtualIndent - The virtual indentation of the list.
     * @returns The finished list container.
     */
    private finishList(items: IsNode[], _virtualIndent?: number): IsList {
        return Factory.list(items);
    }

    /**
     * Parses the value part of an entry line: an empty value expects a deeper node, block headers start block scalars, `{}`/`[]` build empty containers, flow collections are rejected and everything else is an inline scalar.
     * @param rest - The value text after the key/separator.
     * @param info - The structural info of the entry line.
     * @param containerIndent - The indentation of the owning container.
     * @param followFrom - The line index to continue from.
     * @returns The parsed value node and the index of the line after it.
     */
    private parseValueOnLine(rest: string, info: Parser.LineInfo, containerIndent: number, followFrom: number): Parser.ParsedNode {
        if (rest === '') {
            const deeper = this.nextContent(followFrom);
            if (deeper) {
                const sameLevelSequence = deeper.indent === info.indent && Parser.isDashEntry(deeper.text);
                if (deeper.indent > info.indent || sameLevelSequence) return this.parseNode(followFrom, sameLevelSequence ? info.indent - 1 : info.indent);
            }
            return { node: Factory.scalar(null, 'plain'), next: followFrom };
        }
        if (Parser.BLOCK_HEADER.test(rest)) return this.parseBlockScalar(rest, containerIndent, info.index, followFrom);
        if (rest === '{}') {
            this.guardNoContinuation(followFrom, info.indent);
            return { node: Factory.map([]), next: followFrom };
        }
        if (rest === '[]') {
            this.guardNoContinuation(followFrom, info.indent);
            return { node: Factory.list([]), next: followFrom };
        }
        if (rest.startsWith('{') || rest.startsWith('[')) throw new YamlError('Non-empty flow collections are not supported', { line: info.index + 1, unsupported: true });
        const scalar = Parser.parseInlineScalar(rest, info.index);
        this.guardNoContinuation(followFrom, info.indent);
        return { node: scalar, next: followFrom };
    }

    /**
     * Parses a standalone (root or virtual) line as an empty container or an inline scalar, applying the same determinism as `parseValueOnLine`.
     * @param info - The structural info of the standalone line.
     * @param floor - The indentation below which the node ends.
     * @returns The parsed node and the index of the line after it.
     */
    private parseStandaloneScalar(info: Parser.LineInfo, floor: number): Parser.ParsedNode {
        const rawLine = this.vLines[info.index];
        const prefix = rawLine.slice(0, info.indent);
        if (Parser.BLOCK_HEADER.test(info.text)) {
            const block = this.parseBlockScalar(info.text, info.indent, info.index, info.index + 1);
            block.node.meta.prefix = prefix;
            block.node.meta.rest = rawLine.slice(prefix.length);
            return { node: block.node, next: block.next };
        }
        if (info.text === '{}') {
            this.guardNoContinuation(info.index + 1, info.indent);
            const node = Factory.map([]);
            node.meta.prefix = prefix;
            node.meta.rest = rawLine.slice(prefix.length);
            return { node, next: info.index + 1 };
        }
        if (info.text === '[]') {
            this.guardNoContinuation(info.index + 1, info.indent);
            const node = Factory.list([]);
            node.meta.prefix = prefix;
            node.meta.rest = rawLine.slice(prefix.length);
            return { node, next: info.index + 1 };
        }
        if (info.text.startsWith('{') || info.text.startsWith('[')) throw new YamlError('Non-empty flow collections are not supported', { line: info.index + 1, unsupported: true });
        const scalar = Parser.parseInlineScalar(info.text, info.index);
        scalar.meta.prefix = prefix;
        scalar.meta.rest = rawLine.slice(prefix.length);
        this.guardNoContinuation(info.index + 1, info.indent);
        return { node: scalar, next: info.index + 1 };
    }

    /**
     * Throws when a deeper content line follows the current entry, since multiline plain or quoted scalars are unsupported.
     * @param from - The line index to scan from.
     * @param indent - The indentation of the current entry.
     * @throws If a deeper content line is found.
     */
    private guardNoContinuation(from: number, indent: number): void {
        const deeper = this.nextContent(from);
        if (deeper && deeper.indent > indent) throw new YamlError('Multiline plain or quoted scalars are not supported', { line: deeper.index + 1, unsupported: true });
    }

    /**
     * Parses the body lines of a `|`/`>` block scalar into its literal or folded value and the raw body lines.
     * @param header - The `|`/`>` block header token.
     * @param containerIndent - The indentation of the owning container.
     * @param headerIndex - The line index of the block header.
     * @param from - The line index of the first body line.
     * @returns The parsed block scalar and the index of the line after its body.
     * @throws If the header carries an explicit indentation indicator (unsupported).
     */
    private parseBlockScalar(header: string, containerIndent: number, headerIndex: number, from: number): Parser.ParsedNode {
        const match = header.match(Parser.BLOCK_HEADER);
        if (!match || match[2] !== '') throw new YamlError('Block scalar explicit indentation indicators are not supported', { line: headerIndex + 1, unsupported: true });
        const style: IsScalar.Style = header.startsWith('|') ? 'literal' : 'folded';
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
        return { node: Factory.scalar(value, style, chomp, body), next: i };
    }

    /**
     * Whether a line text is a dash entry: exactly `-` or `-` followed by a space.
     * @param text - The line text to check.
     * @returns `true` if the line is a dash entry, `false` otherwise.
     */
    private static isDashEntry(text: string): boolean {
        return text === '-' || /^-(?: |$)/.test(text);
    }

    /**
     * Finds the index of the `key:` colon in a line text, respecting quotes and comments.
     * @param text - The line text to scan.
     * @returns The index of the mapping colon, or `-1` when none is present.
     */
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

    /**
     * Reads a map key token: quoted keys are resolved through `parseInlineScalar`.
     * @param token - The raw key token text.
     * @param line - The 0-based line number used for error reporting.
     * @returns The resolved key and whether it was quoted.
     * @throws If a quoted key does not resolve to a string.
     */
    private static readToken(token: string, line: number): { key: string; quoted: boolean } {
        const trimmed = token.trim();
        if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
            const scalar = Parser.parseInlineScalar(trimmed, line);
            if (typeof scalar.value !== 'string') throw new YamlError('Quoted key must resolve to a string', { line: line + 1 });
            return { key: scalar.value, quoted: true };
        }
        return { key: trimmed, quoted: false };
    }

    /**
     * Splits a raw inline region into its value text, the untouched rest and the inline comment when present.
     * @param region - The raw region after the key separator.
     * @param line - The 0-based line number used for error reporting.
     * @returns The trimmed value, the region up to the comment and the comment text.
     * @throws If a quote is left unterminated.
     */
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

    /**
     * Rejects anchors, aliases and tags at the start of a plain scalar as unsupported.
     * @param value - The plain scalar text to validate.
     * @param line - The 0-based line number used for error reporting.
     * @throws If the value starts with `&`, `*` or `!`.
     */
    private static validatePlain(value: string, line: number): void {
        if (/^[&*!]/.test(value)) throw new YamlError(`Anchors, aliases and tags are not supported: ${value}`, { line: line + 1, unsupported: true });
    }

    /**
     * Parses a single inline scalar token: single quotes, double quotes (with escapes) or a plain scalar.
     * @param token - The raw scalar token.
     * @param line - The 0-based line number used for error reporting.
     * @returns A scalar contract for the token.
     * @throws If a quoted scalar is unterminated.
     */
    private static parseInlineScalar(token: string, line: number): IsScalar {
        if (token.startsWith("'")) {
            if (!token.endsWith("'") || token.length < 2) throw new YamlError('Unterminated single-quoted scalar', { line: line + 1, unsupported: true });
            const inner = token.slice(1, -1).replace(/''/g, "'");
            return Factory.scalar(inner, 'single');
        }
        if (token.startsWith('"')) {
            if (!token.endsWith('"') || token.length < 2) throw new YamlError('Unterminated double-quoted scalar', { line: line + 1, unsupported: true });
            return Factory.scalar(Parser.unescapeDouble(token.slice(1, -1), line), 'double');
        }
        return Factory.scalar(ScalarUtils.resolvePlain(token), 'plain');
    }

    /**
     * Decodes the escape sequences of a double-quoted scalar body.
     * @param inner - The raw text between the double quotes.
     * @param line - The 0-based line number used for error reporting.
     * @returns The decoded string.
     * @throws If an escape sequence is unknown or a `\u` escape is malformed.
     */
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

    /**
     * Parses YAML text into a plain document contract, preserving source formatting metadata.
     * @param text - The YAML text to parse.
     * @returns A plain document contract (`IsDocument`).
     * @throws If the text is invalid, or uses a feature outside the supported subset.
     */
    public static parse(text: string): IsDocument { return new Parser(text).parseDocument(); }

    /** Resolves a plain scalar token to its primitive value. */
    public static resolvePlain(token: string): Primitive {
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
        node: IsNode;
        next: number;
    }
}

export default Parser;