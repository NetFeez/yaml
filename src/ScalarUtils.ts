/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Shared scalar resolution, plain-string validation and scalar rendering for the YAML parser, serializer and AST factory.
 * @license Apache-2.0
 */

export class ScalarUtils {
    /** Resolves a plain YAML token to its primitive value. */
    public static resolvePlain(token: string): string | number | boolean | null {
        if (token === '' || token === '~' || token === 'null' || token === 'Null' || token === 'NULL') return null;
        if (token === 'true' || token === 'True' || token === 'TRUE') return true;
        if (token === 'false' || token === 'False' || token === 'FALSE') return false;
        if (/^[+-]?\d+$/.test(token)) return parseInt(token, 10);
        if (/^0x[0-9a-fA-F]+$/.test(token)) return parseInt(token, 16);
        if (/^0o[0-7]+$/.test(token)) return parseInt(token.slice(2), 8);
        if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(token) && /[.\eE]/.test(token)) return parseFloat(token);
        if (token === '.inf' || token === '.Inf' || token === '.INF' || token === '+.inf') return Infinity;
        if (token === '-.inf' || token === '-.Inf' || token === '-.INF') return -Infinity;
        if (token === '.nan' || token === '.NaN' || token === '.NAN') return NaN;
        return token;
    }

    /** Determines whether a string can be emitted as a plain (unquoted) YAML scalar. */
    public static canBePlain(value: string): boolean {
        if (value === '' || /\s$/.test(value) || /^[ \t]/.test(value)) return false;
        if (/[\n\t\r\x00-\x1f]/.test(value)) return false;
        if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(value)) return false;
        if (value.includes(': ') || value.endsWith(':') || value.includes(' #')) return false;
        return ScalarUtils.resolvePlain(value) === value;
    }

    /** Renders a scalar primitive to its YAML source text with minimal quoting. */
    public static render(value: string | number | boolean | null): string {
        if (value === null) return 'null';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') {
            if (Number.isNaN(value)) return '.nan';
            if (value === Infinity) return '.inf';
            if (value === -Infinity) return '-.inf';
            return String(value);
        }
        return ScalarUtils.quoteString(value);
    }

    private static quoteString(value: string): string {
        if (ScalarUtils.canBePlain(value)) return value;
        if (!/[\n\t\r\x00-\x1f]/.test(value)) return `'${value.replace(/'/g, "''")}'`;
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/[\x00-\x1f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
    }
}

export namespace ScalarUtils {}

export default ScalarUtils;
