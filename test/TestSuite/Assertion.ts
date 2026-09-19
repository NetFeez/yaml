import { Utils } from './Utils.js';

export class Assertion<T> {
    constructor(
        private readonly actual: T,
        private readonly context: Assertion.context,
        private readonly description?: string
    ) {}

    /**
     * Verifies that the actual value is strictly equal to the expected value, and if not, it constructs an error message indicating the expected and actual values and calls the fail method to mark the assertion as failed. This method is used to assert that two values are exactly the same in a strict equality comparison.
     * @param expected - The value that the actual value is expected to be equal to.
     * @param message - An optional custom message to be used in the error if the assertion fails. If not provided, a default message will be constructed indicating the expected and actual values.
     */
    public equals(expected: T, message?: string): void {
        if (this.actual !== expected) {
            this.fail(message || `Expected [${expected}] but received [${this.actual}]`);
        }
    }
    /**
     * Verifies that the actual value is strictly not equal to the expected value, and if it is equal, it constructs an error message indicating that the values should not be equal and calls the fail method to mark the assertion as failed. This method is used to assert that two values are different in a strict equality comparison.
     * @param expected - The value that the actual value should not be equal to.
     * @param message - An optional custom message to be used in the error if the assertion fails. If not provided, a default message will be constructed indicating that the values should not be equal.
     */
    public notEquals(expected: T, message?: string): void {
        if (this.actual === expected) {
            this.fail(message || `Did not expect [${expected}] but received [${this.actual}]`);
        }
    }
    /**
     * Verifies that the actual value is "truthy", meaning it evaluates to true in a boolean context, and if it is not, it constructs an error message indicating that the value should be "truthy" but received a different value, and then calls the fail method to mark the assertion as failed. This method is used to assert that a value is considered true in a boolean context, which includes all values except for false, 0, -0, 0n, "", null, undefined, and NaN.
     * @param message - An optional custom message to be used in the error if the assertion fails. If not provided, a default message will be constructed indicating that the value should be "truthy" but received a different value.
     */
    public ok(message?: string): void {
        if (!this.actual) {
            this.fail(message || `Value should be truthy, but received [${this.actual}]`);
        }
    }
    /**
     * Verifies that the actual value is "falsy", meaning it evaluates to false in a boolean context, and if it is not, it constructs an error message indicating that the value should be "falsy" but received a different value, and then calls the fail method to mark the assertion as failed. This method is used to assert that a value is considered false in a boolean context, which includes false, 0, -0, 0n, "", null, undefined, and NaN.
     * @param message - An optional custom message to be used in the error if the assertion fails. If not provided, a default message will be constructed indicating that the value should be "falsy" but received a different value.
     */
    public notOk(message?: string): void {
        if (this.actual) {
            this.fail(message || `Value should be falsy, but received [${this.actual}]`);
        }
    }
    /**
     * Verifies that the actual value is an instance of a specified type, and if not, it constructs an error message indicating that the instance was not found and calls the fail method to mark the assertion as failed. This method is typically used for assertions involving object instances where the type of the object is expected.
     * @param type - The constructor function of the expected type.
     * @param message - An optional custom message to be used in the error if the assertion fails. If not provided, a default message will be constructed indicating that the instance was not found.
     */
    public instanceOf(type: any, message?: string): void {
        if (!(this.actual instanceof type)) {
            this.fail(message || `Expected instance of ${type.name}`);
        }
    }
    /**
     * Verifies that the actual value includes a specified item, and if not, it constructs an error message indicating that the item was not found in the content and calls the fail method to mark the assertion as failed. This method is typically used for assertions involving strings or arrays where the presence of a specific element is expected.
     * @param item - The item that is expected to be included in the actual value.
     * @param message - An optional custom message to be used in the error if the assertion fails. If not provided, a default message will be constructed indicating that the item was not found in the content.
     */
    public includes(item: any, message?: string): void {
        const content = this.actual as any;
        if (!content?.includes || !content.includes(item)) {
            this.fail(message || `Item not found in content`);
        }
    }
    /**
     * Marks the assertion as failed with a provided reason, constructs an error message that includes the description of the assertion (if available) and the reason for failure, and then calls the context's done method with this information to signal the failure of the test. This method is used internally by other assertion methods to handle failure cases in a consistent manner.
     * @param reason - A string describing the reason for the assertion failure, which will be included in the error message.
     */
    private fail(reason: string): never {
        const fullMessage = this.description ? `(${this.description}) ${reason}` : reason;
        throw new Error(fullMessage);
    }
}
export namespace Assertion {
    export interface context {
        done(message: string, error: Error): void;
    }
}
export default Assertion;