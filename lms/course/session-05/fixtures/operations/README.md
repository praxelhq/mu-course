# Operations exception fixtures

**Suite:** S5-OPS-FIXTURES-v1  
**Pack:** S5-WP-OPS-02  
**Order:** normal, duplicate (without clearing incident store), malformed, timeout, approval.  
**Safety:** synthetic resource IDs; customer notice is always a draft/pending state.

The timeout case uses the controlled mock or outage replay. The private evaluator compares business state and action counts with its secure expected-result contract.
