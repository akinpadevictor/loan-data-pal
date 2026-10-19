import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLoanRisk } from "./aggregate";

test("highest loan aging only uses Active, Bad Loan, and NP Loan classes", () => {
  const [risk] = buildLoanRisk([
    { Phone: "08012345678", "Loan Aging": "7 Days", "Loan Class": "Active", "Total Amount Pending": 10 },
    { Phone: "08012345678", "Loan Aging": "24 Days", "Loan Class": "Bad Loan", "Total Amount Pending": 20 },
    { Phone: "08012345678", "Loan Aging": "42 Days", "Loan Class": "NP Loan", "Total Amount Pending": 30 },
    { Phone: "08012345678", "Loan Aging": "95 Days", "Loan Class": "Closed", "Total Amount Pending": 40 },
    { Phone: "08012345678", "Loan Aging": "120 Days", "Loan Class": "", "Total Amount Pending": 50 },
  ]);

  assert.equal(risk?.max_loan_aging, 42);
  assert.equal(risk?.total_pending, 150);
  assert.equal(risk?.npl_value, 140);
});