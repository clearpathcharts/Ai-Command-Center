"""Background worker for safe text-only AI agent jobs.

Run as a separate long-lived process. It cannot call external tools or perform
side effects; it only returns model-generated text for user review.
"""
import json
import os
import time
import urllib.request
import urllib.error

API_URL = os.environ["COMMAND_CENTER_API_URL"].rstrip("/")
WORKER_TOKEN = os.environ["WORKER_SHARED_SECRET"]
AI_API_KEY = os.environ["AI_API_KEY"]
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4.1-mini")
POLL_SECONDS = max(2, int(os.getenv("WORKER_POLL_SECONDS", "5")))

def request(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL + path, data=body,
        headers={"Content-Type": "application/json", "X-Worker-Token": WORKER_TOKEN},
        method="POST")
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))

def execute(job):
    payload = {
        "model": AI_MODEL,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": "You are a specialist AI agent. Follow the task instructions, write in clear accessible language, state uncertainty, and produce a draft for human review. You cannot perform external actions. Never claim you sent, published, purchased, changed, or deleted anything."},
            {"role": "user", "content": "Agent job: " + job["title"] + "\n\nInstructions: " + job["instructions"]}
        ]
    }
    req = urllib.request.Request(
        AI_BASE_URL + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + AI_API_KEY, "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=90) as response:
        result = json.loads(response.read().decode("utf-8"))
    return result["choices"][0]["message"]["content"]

def main():
    print("AI Command Center worker started; text-only mode.")
    while True:
        try:
            claimed = request("/api/worker/claim", {})
            job = claimed.get("job")
            if not job:
                time.sleep(POLL_SECONDS)
                continue
            try:
                answer = execute(job)
                request("/api/worker/complete", {"id": job["id"], "result": answer, "error": ""})
                print("Completed job:", job["id"])
            except Exception as exc:
                request("/api/worker/complete", {"id": job["id"], "result": "", "error": str(exc)[:2500]})
                print("Failed job:", job["id"])
        except Exception as exc:
            print("Worker loop error:", str(exc)[:500])
            time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()
