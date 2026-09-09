Intent: Repair the production AI interview so every admitted student uses the LiveKit real-time path, Sarvam is primary, Gemini conducts the dialogue, and grading remains worker-driven. Prevent the broken manual recorder fallback, survive transient browser disconnects, and reject new admission when the agent deployment is not healthy.

Review divisions:
1. Agent runtime and provider failover: verify the Sarvam-to-Deepgram/ElevenLabs fallback, LiveKit event handling, and participant disconnect behavior cannot crash or abandon the interview.
2. Token admission and session state: verify health-gated token issuance and retired legacy endpoints cannot strand, mutate, or accidentally complete attempts.
3. Browser reconnect lifecycle: verify the real-time client does not race, duplicate requests, leak timers, or silently return to manual recording after disconnects.
4. Completion and grading boundary: verify an interrupted session does not grade, while a normal completion can still reach the existing worker-driven grade path.
5. Tests: verify the changed test contracts detect the production failures rather than only source text.

Cross-division interaction: test the sequence agent heartbeat -> token -> LiveKit disconnect -> reconnect -> completion, including stale browsers that still call retired endpoints.
