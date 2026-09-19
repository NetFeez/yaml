import { Logger } from "@netfeez/vterm";

import TestContext from "./TestContext.js";
import _Utils from "./Utils.js";

export { _Utils as utils };

export class TestSuite {
    protected readonly logger: Logger

    protected vName: string;
    protected vTests: TestSuite.TestEntry[] = [];

    public constructor(
        name: string
    ) {
        this.vName = TestSuite.cleanName(name);
        this.logger = new Logger({ name: this.prefix });
    }
    public get name(): string { return this.vName; }
    public get prefix(): string { return `suit:${this.name}`; }

    //
    // ====== test control methods ======
    //

    /**
     * Adds a test case to the test suite with a description and a test function. The test function is expected to be an asynchronous function that takes a TestContext as an argument and performs assertions using that context. This method allows for organizing multiple test cases under a single test suite, each with its own description for clarity in logging and reporting.
     * @param description - A string describing the test case, which will be used for logging purposes to identify the test being added to the suite.
     * @param test - A function that contains the actual test code. This function is expected to be an asynchronous function that takes a TestContext as an argument and performs assertions using that context.
     */
    public add(description: string, test: TestSuite.Test): void {
        this.vTests.push({ description, test });
    }
    /**
     * Runs a series of test cases defined in an array of TestSuite.Test functions. Each test case is executed sequentially, and the method waits for each test to complete before starting the next one. The method returns a promise that resolves to true if all tests passed, or false if any test failed.
     * @param tests - An array of test functions, where each function is a TestSuite.Test that defines a test case to be executed. Each test function is executed with a TestContext as its `this` context and as an argument, allowing it to log messages and mark the test as done.
     * @returns A promise that resolves to true if all tests passed, or false if any test failed.
     */
    public async run(tests: TestSuite.TestEntry[] = this.vTests): Promise<boolean> {
        let allPassed = true;
        for (const test of tests) {
            allPassed = await this.test(test.description, test.test) && allPassed;
        }
        return allPassed;
    }
    /**
     * Defines a test case with a description and a test function. The test function is executed with a TestContext that provides methods for logging and marking the test as done.
     * The method logs the start of the test, executes the test function, and handles any errors that may occur during the execution.
     * It also logs the result of the test (passed or failed) based on whether the test context's done method was called with an error or not.
     * @param description - A string describing the test case, which is used for logging purposes to identify the test being executed.
     * @param test - A function that contains the actual test code. This function is executed with a TestContext as its `this` context and as an argument, allowing it to log messages and mark the test as done.
     */
    public async test(description: string, test: TestSuite.Test): Promise<boolean> {
        const logPrefix = '&C(#FFB4DC)'
        const context = new TestContext(this.logger, this.name, `${logPrefix}│  `);

        this.logger.info(`${logPrefix}╭─────────────────────────────────────────────`);
        this.logger.info(`${logPrefix}│ &C6${TestSuite.Utils.splitTexts(description, 44).join(`\n${logPrefix}│ &C6`)}`);
        this.logger.info(`${logPrefix}├─────────────────────────────────────────────`);
        try {
            await test.call(context, context);
            if (context.passed) {
                this.logger.log(`${logPrefix}│ &C2✔ Test passed`); 
            } else {
                this.logger.warn(`${logPrefix}│ &C3⚠ Test finished without explicit done()`);
            }
        } catch (error) {
            const stack = error instanceof Error ? error.stack ?? error.message : String(error);
            this.logger.error(`${logPrefix}│ &C1✖ ${stack.split('\n').join(`\n${logPrefix}│ &C1`)}`);
        } finally { this.logger.info(`${logPrefix}╰─────────────────────────────────────────────`); }
        return context.passed === true;
    }

    //
    // ====== support methods ======
    //

    /**
     * Cleans the test suite name by trimming whitespace and converting it to lowercase.
     * This ensures that the name is standardized and can be used consistently for logging and identification purposes.
     * The cleaned name is returned as a string.
     * 
     * @param name - The original name of the test suite, which may contain leading or trailing whitespace and may be in mixed case.
     * @returns The cleaned name of the test suite, which is trimmed and converted to lowercase.
     */
    private static cleanName(name: string): string {
        return name.trim().toLowerCase();
    }
}
export namespace TestSuite {
    export import Utils = _Utils;

    export type Test = (this: TestContext, test: TestContext) => Promise<void> | void;

    export interface TestEntry {
        description: string;
        test: Test;
    }
}
export default TestSuite;