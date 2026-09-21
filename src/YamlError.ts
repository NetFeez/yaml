/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Error type for YAML parsing failures, distinguishing unsupported features from syntax errors.
 * @license Apache-2.0
 */

export class YamlError extends Error {
    public readonly line: number | null;
    public readonly unsupported: boolean;

    /**
     * Creates a new YamlError instance.
     * @param message - The error message.
     * @param options - Additional options for the error.
     */
    public constructor(message: string, options: YamlError.Options = {}) {
        super(options.line === undefined ? message : `${message} (line ${options.line})`);
        this.line = options.line ?? null;
        this.unsupported = options.unsupported ?? false;
    }
}

export namespace YamlError {
    export interface Options {
        line?: number;
        unsupported?: boolean;
    }
}

export default YamlError;