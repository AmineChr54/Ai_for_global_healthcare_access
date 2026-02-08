"""Quick test for the lite pipeline."""
import time
import requests

t0 = time.time()
r = requests.post(
    "http://localhost:8000/api/query",
    json={"question": "How many hospitals have cardiology?"},
    timeout=300,
)
elapsed = time.time() - t0

print(f"Status: {r.status_code}")
print(f"Time: {elapsed:.1f}s")

if r.status_code == 200:
    d = r.json()
    print(f"Intent: {d.get('intent')}")
    print(f"Agents: {d.get('required_agents')}")
    print(f"Facilities highlighted: {len(d.get('facility_names', []))}")
    print(f"Answer preview:\n{d.get('synthesis', '')[:400]}")
else:
    print(f"Error: {r.text}")
