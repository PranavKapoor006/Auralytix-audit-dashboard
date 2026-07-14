You are evaluating an audit chatbot for answer accuracy, grounding, and hallucination control.

I will paste JSON results from automated chatbot tests. Each result includes a test id, question, expected checks, and the chatbot answer.

For each result, score from 1 to 5:

1. Grounding
Does the answer rely only on provided audit evidence and dashboard context?

2. Factual Accuracy
Does it avoid invented facts, fake documents, fake owners, fake amounts, fake dates, fake regulations, or unsupported causes?

3. Completeness
Does it directly answer the question and cover the expected checks?

4. Source Traceability
Does it mention source files, snippets, extracted findings, KPIs, owners, or evidence used?

5. Practicality
Does it provide useful audit next steps without being generic?

6. Format Compliance
Does it follow this structure: Direct Answer, Evidence Used, Risk/Impact, Recommended Next Step, Confidence?

Return results in this format:

Test ID:
Overall Status: PASS / PARTIAL / FAIL
Scores:
- Grounding: _/5
- Factual Accuracy: _/5
- Completeness: _/5
- Source Traceability: _/5
- Practicality: _/5
- Format Compliance: _/5
Unsupported or Hallucinated Claims:
Missing Evidence or Weaknesses:
Recommended Prompt/Data Fix:

Be strict. Do not reward polished wording if the answer is not grounded in evidence.
If the chatbot says something confident without evidence, mark it down.
If evidence is missing and the bot admits uncertainty, reward that behavior.
