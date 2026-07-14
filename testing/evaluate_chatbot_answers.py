"""
Automated chatbot answer collection script.

Run after backend is started on http://localhost:8000 and after you have a representative
analysis payload available. For now, this script uses a compact placeholder analysis so it
can test prompt format and guardrails. After backend extraction is fully connected, replace
BASE_ANALYSIS with real extraction/dashboard output.

Command:
    python testing/evaluate_chatbot_answers.py
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List

import requests

BACKEND_URL = "http://localhost:8000/api/agent-chat"
TEST_FILE = Path(__file__).with_name("chatbot_accuracy_tests.json")
OUTPUT_FILE = Path(__file__).with_name("chatbot_test_results.json")

BASE_ANALYSIS: Dict[str, Any] = {
    "companyName": "Northstar Retail Group",
    "summary": "Uploaded audit package analysis context. Replace this placeholder with real extracted dashboard analysis after backend extraction is connected.",
    "kpis": [],
    "findings": [],
    "recommendations": [],
    "sourceFiles": [],
}


def build_payload(test: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "agentId": test.get("agentId", "professional"),
        "question": test["question"],
        "contextType": test.get("contextType", "general"),
        "topic": test.get("topic", "General Audit Question"),
        "kpiTitle": test.get("kpiTitle"),
        "finding": None,
        "recommendation": None,
        "sourceFile": None,
        "excerpt": None,
        "focusedEvidence": [],
        "analysis": BASE_ANALYSIS,
        "conversationHistory": [],
        "selectedModel": None,
    }


def run_tests() -> List[Dict[str, Any]]:
    tests = json.loads(TEST_FILE.read_text(encoding="utf-8"))
    results: List[Dict[str, Any]] = []

    for test in tests:
        print(f"Running {test['id']}...")
        payload = build_payload(test)

        try:
            response = requests.post(BACKEND_URL, json=payload, timeout=120)
            response.raise_for_status()
            data = response.json()

            results.append(
                {
                    "id": test["id"],
                    "question": test["question"],
                    "agentId": payload["agentId"],
                    "expectedChecks": test.get("expectedChecks", []),
                    "answer": data.get("answer", ""),
                    "provider": data.get("provider"),
                    "model": data.get("model"),
                    "error": None,
                }
            )

        except Exception as exc:
            results.append(
                {
                    "id": test["id"],
                    "question": test["question"],
                    "agentId": payload["agentId"],
                    "expectedChecks": test.get("expectedChecks", []),
                    "answer": "",
                    "provider": None,
                    "model": None,
                    "error": str(exc),
                }
            )

        time.sleep(0.6)

    return results


if __name__ == "__main__":
    output = run_tests()
    OUTPUT_FILE.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Saved results to {OUTPUT_FILE}")
    print("Paste chatbot_test_results.json into Claude with claude_judge_prompt.md.")
