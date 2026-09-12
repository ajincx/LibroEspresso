# Non-production smoke-test checklist

Use a dedicated test database or controlled fixtures. Do not execute mutation steps against live operational records.

Record the tester, application revision, environment, date/time, result, and evidence for every step. As Owner, sign in, open the dashboard, generate an authorized report preview, export PDF and XLSX, and sign out. As Branch Manager, sign in, preview a controlled POS CSV, confirm the test import, submit a controlled inventory count, investigate the resulting variance, generate an assigned-branch report, and sign out. As Staff, sign in, submit a controlled incident, open the submitted report, verify that management routes are blocked, and sign out.

Afterward, remove only the documented controlled fixtures, confirm that no test import or incident remains, and verify the export audit events. Any failed step blocks release until the defect is recorded and resolved or formally accepted.
