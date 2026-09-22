SYNTHETIC END-TO-END TEST DATA

All data in this folder is fictional.

Intended test coverage:
SMP-001: designed MATCHED case.
SMP-002: invoice tax mismatch (invoice PDF has a CGST difference).
SMP-003: invoice customer mismatch.
SMP-004: invoice evidence intentionally omitted to test MISSING evidence.
SMP-005: payment amount mismatch.
SMP-006: two bank credits share the payment amount; reference/date logic should still select UTR006 rather than silently choosing by amount.
SMP-007: guest mismatch in invoice evidence.
SMP-008: bank evidence can be used for a normal matched case.

Recommended upload order:
1. company_rcm.csv in Company RCM (manual entry is also supported)
2. sales_register.csv
3. payment_register.csv
4. bank_statement.csv
5. audit_samples.csv
6. invoice PDFs in demo_data/invoices
