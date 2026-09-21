/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Wrapper view over a raw scalar contract (a leaf).
 * `value` is the transform accessor: reading it passes through to the contract primitive, assigning it marks the node dirty so the serializer re-renders its line; scalar formatting (`style`, `chomp`, `body`) stays readable for advanced editing.
 * @license Apache-2.0
 */

import { SCALAR, IsScalar, isScalar, JsonValue, Primitive } from '../ast/Contracts.js';
import Factory from '../ast/Factory.js';

import YamlError from '../YamlError.js';
import Node from './Node.js';

import type Document from '../Document.js';

export class ScalarNode extends Node implements IsScalar {
    public readonly [SCALAR]: true = true;

    public constructor(node: IsScalar, document: Document) { super(node, document); }

    /** The raw contract this wrapper views, narrowed to a scalar. */
    public override get contract(): IsScalar {
        if (!isScalar(this.vNode)) throw new YamlError('ScalarNode contract is not a scalar');
        return this.vNode;
    }

    public get style(): IsScalar.Style { return this.contract.style; }
    public get chomp(): IsScalar.Chomp { return this.contract.chomp; }
    public get body(): string[] { return this.contract.body; }

    /**
     * The plain value of this scalar; assigning validates the primitive, stores it in the contract and marks the node dirty.
     * @throws If the assigned value is a container (replace the node through its parent instead).
     */
    public override get value(): Primitive { return this.contract.value; }

    public override set value(value: Primitive) {
        if (value !== null && typeof value === 'object') throw new YamlError('Cannot give a scalar a container value in place; replace it through set() on its parent');
        this.contract.value = value;
        this.contract.meta.dirty = true;
    }

    /**
     * Clones this scalar node, returning a new ScalarNode wrapper over a cloned contract.
     * @returns A new ScalarNode wrapper over a cloned contract.
     * @throws If the cloned contract does not wrap to a ScalarNode.
     */
    public override clone(): ScalarNode {
        const wrapped = this.vDocument.wrap(Factory.clone(this.contract));
        if (!(wrapped instanceof ScalarNode)) throw new YamlError('Cloned scalar contract did not wrap to a ScalarNode');
        return wrapped;
    }
}

export namespace ScalarNode {}

export default ScalarNode;