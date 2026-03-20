DIMENSION_RUBRICS = """\
## Evaluation Dimensions and Scoring Rubrics

You must evaluate the candidate across the following eight dimensions. For each \
dimension, assign a score from 0 to 100, a narrative explanation, and specific \
evidence from the transcript.

---

### 1. Problem Decomposition
How well the candidate breaks down the problem into manageable pieces before and \
during implementation.

- **90-100 (Exceptional):** Immediately identifies core sub-problems and tackles them \
in a logical order. Creates clear milestones. Demonstrates a structured plan that \
anticipates dependencies between components. Adjusts decomposition as new information \
emerges.
- **70-89 (Good):** Shows a systematic approach to breaking the problem apart. \
Identifies most sub-problems up front. Proceeds in a sensible order with only minor \
backtracking caused by missed dependencies.
- **50-69 (Adequate):** Attempts to decompose but misses significant sub-problems or \
tackles them in a suboptimal order. Some evidence of planning, but gaps lead to \
rework.
- **30-49 (Poor):** Minimal decomposition. Jumps into coding without a clear plan. \
Frequently discovers missing pieces mid-implementation, causing significant rework.
- **0-29 (None):** No visible attempt to decompose the problem. Works in a chaotic, \
unstructured manner with no discernible strategy.

---

### 2. First Principles Thinking
Whether the candidate reasons from fundamental concepts rather than relying solely on \
pattern-matching or copying existing solutions.

- **90-100 (Exceptional):** Clearly articulates the underlying principles behind \
design choices. Questions assumptions. Explains *why* an approach works, not just \
*what* it does. Derives solutions from core concepts when encountering novel problems.
- **70-89 (Good):** Demonstrates solid understanding of fundamentals. Most decisions \
are justified with reasoning. Occasionally references principles when making trade-off \
decisions.
- **50-69 (Adequate):** Shows awareness of some fundamentals but relies heavily on \
familiar patterns without deeper reasoning. Can explain choices when prompted but \
doesn't proactively reason from first principles.
- **30-49 (Poor):** Rarely reasons from fundamentals. Copies patterns without \
understanding them. Struggles to explain why a particular approach was chosen.
- **0-29 (None):** No evidence of principled reasoning. Appears to guess or \
trial-and-error without understanding.

---

### 3. Creativity & Innovation
The originality and cleverness of the candidate's approach, prompts, and solutions.

- **90-100 (Exceptional):** Proposes novel approaches that go beyond the obvious \
solution. Uses the AI assistant in creative ways (e.g., generating test cases, \
exploring alternative architectures, rubber-ducking). Finds elegant simplifications.
- **70-89 (Good):** Shows inventiveness in at least some aspects. Explores multiple \
approaches before committing. Uses the AI assistant for more than just code generation.
- **50-69 (Adequate):** Follows a straightforward path with occasional creative \
touches. Uses the AI assistant primarily for direct code generation but may ask for \
alternatives.
- **30-49 (Poor):** Sticks to the most obvious approach throughout. Uses the AI \
assistant in a rote, mechanical fashion with little variation.
- **0-29 (None):** No creativity observed. Entirely mechanical interaction with no \
exploration of alternatives.

---

### 4. Iteration Quality
How effectively the candidate refines their work through successive iterations.

- **90-100 (Exceptional):** Each iteration demonstrably improves the solution. Builds \
on feedback from the AI and from testing. Iterations are focused and purposeful. \
Converges efficiently toward a high-quality solution.
- **70-89 (Good):** Most iterations move the solution forward. Incorporates feedback \
well. Occasionally revisits earlier decisions productively. Shows clear progression.
- **50-69 (Adequate):** Iterates but sometimes spins in circles. Some iterations don't \
clearly improve the solution. May repeat similar prompts without adjusting approach.
- **30-49 (Poor):** Iterations are unfocused. Frequently undoes previous progress. \
Doesn't learn from failed attempts. Repeats the same mistakes across iterations.
- **0-29 (None):** No meaningful iteration. Either gives up after first attempt or \
makes random changes without learning.

---

### 5. Debugging Approach
How the candidate identifies, diagnoses, and resolves errors and unexpected behavior.

- **90-100 (Exceptional):** Methodically isolates bugs. Reads error messages carefully \
and reasons about root causes. Uses targeted debugging strategies (logging, bisecting, \
unit tests). Fixes the root cause rather than symptoms. Learns from each bug.
- **70-89 (Good):** Generally effective debugging. Reads errors and forms reasonable \
hypotheses. Usually finds root causes with moderate effort. Uses the AI assistant \
effectively to help diagnose issues.
- **50-69 (Adequate):** Can debug with assistance but sometimes misreads errors or \
fixates on wrong causes. May rely heavily on the AI to diagnose without contributing \
own analysis.
- **30-49 (Poor):** Struggles with debugging. Ignores error messages or \
misinterprets them. Makes random changes hoping to fix issues. Doesn't form hypotheses.
- **0-29 (None):** Cannot debug effectively. Panics at errors. No systematic approach \
to identifying or fixing problems.

---

### 6. Architecture Thinking
The candidate's ability to think about system design, structure, and long-term \
maintainability.

- **90-100 (Exceptional):** Proactively considers code organization, separation of \
concerns, extensibility, and edge cases. Chooses appropriate data structures and \
patterns. Thinks about how components interact at a system level.
- **70-89 (Good):** Shows awareness of architectural concerns. Organizes code \
reasonably. Considers some edge cases and future maintenance. Makes generally sound \
structural decisions.
- **50-69 (Adequate):** Basic code organization is present but may be ad-hoc. Limited \
consideration of edge cases or extensibility. Functional but not well-structured.
- **30-49 (Poor):** Little attention to structure. Code is disorganized. No \
consideration of edge cases, error handling, or maintainability.
- **0-29 (None):** No architectural thinking. Monolithic, unstructured code with no \
organization.

---

### 7. Communication Clarity
How clearly and effectively the candidate communicates intent through prompts, \
comments, and interactions with the AI assistant.

- **90-100 (Exceptional):** Prompts are precise, well-scoped, and provide necessary \
context. Clearly articulates requirements and constraints. Asks focused follow-up \
questions. Code comments and naming are excellent.
- **70-89 (Good):** Prompts are generally clear and effective. Provides adequate \
context in most cases. Communication is mostly unambiguous. Good variable and function \
naming.
- **50-69 (Adequate):** Prompts are sometimes vague or overly broad. Occasionally \
needs to re-explain intent. Adequate but not exceptional communication.
- **30-49 (Poor):** Frequently unclear or ambiguous prompts. Struggles to articulate \
what they want. Prompts often lead to misunderstood results requiring correction.
- **0-29 (None):** Extremely unclear communication. Prompts are confusing, \
contradictory, or incomprehensible.

---

### 8. Efficiency
How well the candidate manages time and effort, avoiding unnecessary work and making \
good use of the AI assistant.

- **90-100 (Exceptional):** Excellent time management. Avoids rabbit holes. Delegates \
appropriate tasks to the AI while maintaining oversight. Achieves strong results \
within the time available. Prioritizes effectively.
- **70-89 (Good):** Generally efficient. Occasionally spends too long on minor issues \
but recovers. Good balance of AI delegation and manual work. Completes most objectives.
- **50-69 (Adequate):** Some inefficiency — spends too long on low-value tasks or \
gets stuck in unproductive loops. May under- or over-delegate to the AI.
- **30-49 (Poor):** Significant time wasted on tangents, repeated failures, or \
unnecessary work. Poor delegation strategy with the AI assistant.
- **0-29 (None):** Extremely inefficient. Most time is wasted. Little to no productive \
output relative to time spent.

---

Use these rubrics to assign precise scores. Provide specific evidence from the \
transcript for each score. Be fair but rigorous.

### Interviewer Dialogue Evidence
If the transcript includes a LIVE INTERVIEWER DIALOGUE section, incorporate it into \
your scoring as follows:

- **First Principles Thinking**: Candidate questions to the interviewer that probe \
constraints, assumptions, or non-obvious edge cases (e.g. "Does this need to handle \
concurrent writes?", "What's the expected p99 latency?") are strong positive signals. \
Generic questions ("Can you clarify the problem?") are neutral.

- **Architecture Thinking**: Replies to probing questions that articulate trade-offs, \
reference system-level concerns (consistency vs. availability, storage vs. compute), \
or compare design alternatives are strong positive signals for this dimension.

- **Communication Clarity**: How well the candidate expresses their reasoning in \
spoken dialogue — concise, specific, and well-structured answers score higher than \
vague or confused responses.

- **Problem Decomposition**: Candidate questions that seek to clarify scope or \
boundary conditions before diving in signal structured thinking.

- **Efficiency**: A candidate who asks targeted clarifying questions early and doesn't \
waste time on wrong assumptions demonstrates efficient problem-solving strategy.

---

## Observed vs Expected Evidence

For each dimension you MUST populate both `observed_points` and `expected_standard`.

### observed_points
Provide one entry per meaningful candidate action that is relevant to this dimension. \
Aim for at least 2-5 points per dimension where evidence exists (more is better). For each entry:

- **transcript_quote**: Copy the exact or near-verbatim text of what the candidate typed \
or prompted. This is the raw evidence — do not paraphrase it.
- **observation**: In 1-2 sentences, explain what this specific action reveals about \
the candidate's competence on this dimension. Be analytical and precise.
- **comparison**: In 1-2 sentences, describe how a strong, well-prepared candidate \
for THIS specific role and challenge would have handled the same situation — infer \
the role level, stack, and difficulty from the challenge description and set \
expectations accordingly. Do NOT default to a generic senior-engineer bar.

If a dimension genuinely has no relevant evidence in the transcript, still provide \
at least one entry explaining what was absent and what should have been present.

### expected_standard
Write 2-4 sentences describing what a strong, well-prepared candidate for THIS \
specific role and challenge would ideally do on this dimension. Derive the bar \
from the challenge description — infer the role level (junior, mid, senior, staff), \
the stack, the domain, and the difficulty. Set realistic expectations for that \
context: a mid-level frontend challenge demands different standards than a \
staff-level distributed systems design. Be concrete and specific to the challenge: \
reference the type of work, the tools, the patterns, and the decision-making \
quality that fits the role. Do NOT write generic advice and do NOT default to a \
"senior engineer at 100" framing regardless of the actual role.
"""
