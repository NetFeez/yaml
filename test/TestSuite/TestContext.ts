/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Per-test context exposing assertions, logging, delays and async event helpers.
 * @license Apache-2.0
 */

import { Logger } from "@netfeez/vterm";

import Assertion from "./Assertion.js";
import Utils from "./Utils.js";

export class TestContext {
    public passed: boolean | null = null;
    public logger: Logger;

    /**
     * Creates a test context bound to a logger and a display prefix.
     * @param logger - The logger to write test messages to.
     * @param name - The name of the suite owning this context.
     * @param logPrefix - The prefix prepended to every logged line.
     */
    public constructor(
        logger: Logger,
        public readonly name: string,
        public readonly logPrefix: string = '&C(#FFB4DC)│  '
    ) {
        this.logger = new Logger(logger);
        this.logger.save = false;
    }

    //
    // ====== test control methods ======
    //

    /**
     * Marks the test as passed or failed and logs the outcome.
     * @param message - The outcome message to log.
     * @param error - When provided, marks the test as failed.
     */
    public done(message?: string, error?: Error): void {
        if (error) {
            this.passed = false;
            this.logger.log(`${this.logPrefix} &C1${message || 'Test failed'}`);
        } else {
            this.passed = true;
            this.logger.log(`${this.logPrefix} &C2${message || 'Test passed'}`);
        }
    }

    /**
     * Marks the test as failed by setting the passed property to false and logging an error message using the test context's logger. This method is typically called when an assertion fails or when an unexpected error occurs during the execution of a test case, allowing for consistent handling of test failures and providing informative logging for debugging purposes.
     * @param message - A string describing the reason for the test failure, which will be included in the logged error message.
     */
    public fail(message: string): never {
        throw new Error(message);
    }

    //
    // ====== assertion methods ======
    //

    /**
     * Creates an assertion for the given actual value and description.
     * @param actual - The value to be asserted.
     * @param description - An optional description for the assertion.
     * @returns An instance of the Assertion class.
     */
    public expect<T>(actual: T, description?: string): Assertion<T> {
        return new Assertion(actual, this, description);
    }

    //
    // ====== testing utility methods ======
    //

    /**
     * Asynchronously pauses the execution of the test for a specified duration, allowing for timing control in test scenarios where certain events or conditions need to be met before proceeding with assertions or test completion. This method is particularly useful for simulating delays, waiting for asynchronous operations to complete, or controlling the flow of time-dependent tests.
     * @param ms - The number of milliseconds to pause the execution of the test.
     * @returns A promise that resolves after the specified duration has elapsed, allowing the test to continue execution.
     */
    public async sleep(ms: number): Promise<void> {
        return Utils.sleep(ms);
    }

    /**
     * Awaits a specific event or condition defined by the provided executor function, with an optional timeout to limit the waiting period. This method is designed to facilitate asynchronous testing scenarios where certain events or conditions need to be met before proceeding with assertions or test completion.
     * @param executor - An asynchronous function that defines the event or condition to wait for. This function should accept a callback (done) that it calls when the event or condition is met, allowing the test to proceed.
     * @param timeout - An optional number representing the maximum time (in milliseconds) to wait for the event or condition to be met. If the timeout is reached without the event occurring, the returned promise will reject with a timeout error.
     * @returns A promise that resolves with the result of the executor function when the event or condition is met, or rejects if an error occurs or if the timeout is reached.
     */
    public async awaitEvent<R extends any>(
        executor: Utils.AsyncEvent.Exec<R>,
        timeout: number = -1
    ): Promise<R> {
        return Utils.awaitEvent(executor, timeout);
    }

    //
    // ====== logging methods ======
    //

    /**
     * Logs an informational message using the test context's logger with a custom log level.
     * @param args - The arguments to be logged, which can be of any type.
     */
    public info(...args: any[]): void {
        args = Utils.customizeArgs(args, this.logPrefix);
        this.logger.info(`${this.logPrefix}&C7`, ...args);
    }

    /**
     * Logs an error using the test context's logger with a custom log level.
     * @param args - The arguments to be logged, which can be of any type.
     */
    public error(...args: any[]): void {
        args = Utils.customizeArgs(args, this.logPrefix);
        this.logger.error(`${this.logPrefix}&C1`, ...args);
    }

    /**
     * Logs a warning using the test context's logger with a custom log level.
     * @param args - The arguments to be logged, which can be of any type.
     */
    public warn(...args: any[]): void {
        args = Utils.customizeArgs(args, this.logPrefix);
        this.logger.warn(`${this.logPrefix}&C3`, ...args);
    }
    
    /**
     * Logs a message using the test context's logger with a custom log level.
     * @param args - The arguments to be logged, which can be of any type.
     */
    public log(...args: any[]): void {
        args = Utils.customizeArgs(args, this.logPrefix);
        this.logger.log(`${this.logPrefix}&C7`, ...args);
    }
}
export namespace TestContext {}
export default TestContext;