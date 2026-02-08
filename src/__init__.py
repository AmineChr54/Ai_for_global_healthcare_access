"""
VF Healthcare Agent — LangGraph Pipeline for Global Healthcare Access Intelligence.

Supervisor + Map-Reduce + Feedback Loop architecture:
  Layer 1: Intent Classifier (router)
  Layer 2: Query Planner & Medical Rewriter
  Layer 3: Parallel Retrieval Agents (Text2SQL, Vector Search, Geospatial, External Data)
  Layer 4: Medical Reasoning Agent
  Layer 5: Response Synthesizer with Citations
  Layer 6: Quality Gate with feedback loop
"""
