# Core Analysis Metrics

IMPORTANT: While implementing, keep in mind that the metrics might evolve over time and that the scoring should accomodate that behaviour.

## AI Grilling

The ability to critically question an AI-generated solution to understand why it works, verify that the reasoning is sound, and confirm that the proposed solution is actually legitimate.

## Calibrated AI Trust

The ability to use AI as a tool for becoming better without treating its output as automatically correct. Having no trust in AI should not be counted as a negative by itself, but using AI productively is a positive signal. The main concern is whether the developer questions AI appropriately, pushes back when something seems wrong or incomplete, and avoids blindly trusting AI-generated solutions.

## Direct Code Inspection

The ability to look at and read the relevant files directly when there is confusion, uncertainty, or a need to verify how something actually works. Instead of trusting AI output blindly, the developer should use the codebase itself as the source of truth and rely on their own judgement when forming conclusions.

## Code Comprehension Questions

The ability to ask targeted questions about what a particular file, function, module, or block of code does, so the developer can understand intent, behavior, dependencies, and implementation details at the right level of abstraction.

## Problem And Domain Understanding

The ability to demonstrate knowledge of the problem statement and domain through the questions the developer asks and the solutions they propose. This metric is entirely non-AI based and should be used to gauge whether the developer understands the relevant concepts, constraints, tradeoffs, and expected behavior of the system.

## Care About Clean Code

The ability to value code that is readable, maintainable, and appropriately organized. The developer should care about naming, structure, simplicity, duplication, and whether the implementation can be understood and safely changed by others later.

## Care About Optimization

The ability to notice and care about performance, efficiency, and resource usage where they matter for the problem. The developer should consider whether a solution is unnecessarily slow, expensive, or wasteful, while still balancing optimization against readability, maintainability, and the actual constraints of the system.

## Codebase Mental Mapping

The ability to chart the codebase and build a practical mental map of its structure, identifying the vital files, modules, data flows, and integration points while also recognizing which areas can be safely ignored given the current problem statement and constraints.

## Change Impact Awareness

The ability to recognize that deleting or editing one part of a system can have unwanted side effects on other parts. Since system elements often depend on each other, the developer should take care that touching one element does not harm related elements as much as possible, and that any resulting problems have a limited blast area.

For example, suppose a system has flows A, B and C, and a new flow D needs to be added. While adding D, care should be taken to make sure that A, B and C continue to work as they did before the introduction of D, unless changes to those flows were also expected.

Similarly, in a Firebase app where the Firestore rules for the user collection are too broad, narrowing those rules should not unintentionally alter the existing sign up process or any other valid process dealing with that collection.

## Runtime Flow And Event Sequencing

The ability to debug a system by reasoning about the order, timing, and nature of runtime events. The developer should ask what happens first, what state exists at each step, and how later events may be affected by changes caused by earlier events.

For example, in a drag and drop system where the drag starts with one layout, then on the first movement some children disappear and the list layout changes while drag and drop is active, a strong first question would be about the order and nature of the drag start and move events.

## Subagent Research Delegation

The ability to use subagents to perform focused research about a specific part of the problem, such as exploring the codebase, tracing usage of a module, or checking for possible conflicts while the main session continues reasoning about the broader implementation.

For example, if the goal is to narrow the rules for a User collection, the developer might send one subagent to look through the codebase for places where the User collection is written to and flag anything that could conflict with the new rules. Meanwhile, the main session can continue discussing safer ways to narrow the rules' scope.

When the subagent returns with new information, the developer should use that information to make better judgements about the implementation, risks, and necessary verification.
