export class Utils {
    /**
     * Splits the given text into multiple lines based on the specified maximum length.
     * This is useful for formatting long descriptions or messages in a more readable way.
     * The split text is returned as an array of strings.
     * 
     * @param description - The text to be split.
     * @param maxLength - The maximum length of each line (default is 50).
     * @returns An array of strings representing the split lines.
     */
    public static splitTexts(description: string, maxLength: number = 50): string[] {
        const regex = new RegExp(`(.{1,${maxLength}})(?:\\s|$|\\n)`, 'g');
        return description.match(regex)?.map(line => line.trim()) || [description];
    }
    /**
     * Customizes the arguments for logging by applying specific formatting based on their types. This method processes each argument and formats it accordingly:
     * - Strings are split into multiple lines if they exceed a certain length and prefixed for better readability.
     * - Numbers are colored differently for emphasis.
     * - Booleans are colored based on their value (true or false).
     * - Errors are formatted to display their message clearly.
     * - Objects are stringified and formatted to show their structure, including the constructor name if available.
     * The customized arguments are returned as an array of formatted strings or values ready for logging.
     * 
     * @param args - An array of arguments to be customized for logging.
     * @returns An array of customized arguments formatted for logging.
     */
    public static customizeArgs(args: any[], logPrefix: string = ''): any[] {
        args = args.map((arg) => {
            if (typeof arg === 'string') return Utils.splitTexts(arg, 40).join(`\n${logPrefix} `);
            else if (typeof arg === 'number') return `&C3${arg}`;
            else if (typeof arg === 'boolean') return `&C${arg ? '6' : '1'}${arg}`;
            else if (arg instanceof Error) return `&C1${arg.message}`;
            else if (arg instanceof Object) {
                if (arg.constructor && arg.constructor.name) return Utils.splitTexts(`[${arg.constructor.name}] ${JSON.stringify(arg, null, 4)}`, 40).join(`\n${logPrefix} │ - `);
                return Utils.splitTexts(JSON.stringify(arg, null, 4), 40).join(`\n${logPrefix} `);
            } return arg;
        }); return args;
    }    
    /**
     * Asynchronously waits for a specific event to occur by executing the provided executor function.
     * The executor function is expected to call a done callback when the event occurs, passing any relevant result.
     * The method also supports an optional timeout parameter, which will reject the promise if the event does not occur within the specified time frame.
     * 
     * @param executor - A function that executes the logic to wait for the event and calls the done callback when the event occurs.
     * @param timeout - An optional timeout in milliseconds after which the promise will be rejected if the event has not occurred (default is -1, meaning no timeout).
     * @returns A promise that resolves with the result passed to the done callback when the event occurs, or rejects if an error occurs or if the timeout is reached.
     */
    public static async awaitEvent<R extends any>(
        executor: Utils.AsyncEvent.Exec<R>,
        timeout: number = -1
    ): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            let timer: NodeJS.Timeout | null = null;
            let isSettled = false;
            let cleanupHandler: Utils.AsyncEvent.Clean | void;

            const cleanup = () => {
                isSettled = true;
                if (!timer) return;
                clearTimeout(timer);
                timer = null;
                if (typeof cleanupHandler === 'function') {
                    cleanupHandler();
                }
            };

            const safeResolve = (result: R) => {
                if (isSettled) return;
                cleanup();
                resolve(result);
            };

            const safeReject = (err: any) => {
                if (isSettled) return;
                cleanup();
                reject(err instanceof Error ? err : new Error(String(err)));
            };

            if (timeout > 0) {
                timer = setTimeout(() => {
                    safeReject(new Error(`Async event timed out after ${timeout}ms`));
                }, timeout);
            }

            try {
                const result = executor(safeResolve, safeReject);
                if (result instanceof Promise) {
                    result.then(h => { cleanupHandler = h; }).catch(safeReject);
                } else {
                    cleanupHandler = result;
                }
            } catch (error) { safeReject(error); }
        });
    }
    /**
     * Asynchronously waits for a specified amount of time (in milliseconds) before resolving.
     * This method can be used in test cases to introduce delays or to wait for certain conditions to be met before proceeding with assertions or further test steps.
     * @param ms - The number of milliseconds to wait before the promise resolves.
     * @returns A promise that resolves after the specified delay.
     * @remarks This method is useful for simulating asynchronous operations, waiting for events to occur, or introducing delays in test execution to ensure that certain conditions are met before proceeding with assertions or further test steps.
     */
    public static async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
export namespace Utils {
    export namespace AsyncEvent {
        export type Clean = () => void;
        export type Done<R> = (result: R) => void;
        export type Fail = (error: Error) => void;
        export type Exec<R> = (done: Done<R>, fail: Fail) => void | Promise<void>;
    }
}
export default Utils;