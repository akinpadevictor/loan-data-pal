import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCustomers, buildLoanMonths, buildLoanRisk, buildPhoneRefs } from "./aggregate";

test("highest loan aging only uses Active, Bad Loan, and NP Loan classes", () => {
  const [risk] = buildLoanRisk([
    { REF: "ref1", "Loan Aging": "7 Days", "Loan Class": "Active", "Total Amount Pending": 10 },
    { REF: "ref1", "Loan Aging": "24 Days", "Loan Class": "Bad Loan", "Total Amount Pending": 20 },
    { REF: "ref1", "Loan Aging": "42 Days", "Loan Class": "NP Loan", "Total Amount Pending": 30 },
    { REF: "ref1", "Loan Aging": "95 Days", "Loan Class": "Closed", "Total Amount Pending": 40 },
    { REF: "ref1", "Loan Aging": "120 Days", "Loan Class": "", "Total Amount Pending": 50 },
  ]);

  assert.equal(risk?.max_loan_aging, 42);
  assert.equal(risk?.total_pending, 150);
  assert.equal(risk?.npl_value, 140);
});

test("one phone number with several REFs keeps the customers separate", () => {
  const rows = [
    { REF: "refa", Phone: "08011111111", LOANAMOUNT: 100, LOANDATE: "2026-09-01" },
    { REF: "refb", Phone: "08011111111", LOANAMOUNT: 50, LOANDATE: "2026-09-02" },
  ];
  const months = buildLoanMonths(rows);
  assert.deepEqual(months.map((m) => m.ref).sort(), ["refa", "refb"]);
  const a = months.find((m) => m.ref === "refa");
  assert.equal(a?.loan_amount, 100);
});

test("rows without a REF attach through the phone when it maps to one REF", () => {
  const phoneRefs = buildPhoneRefs([{ ref: "refc", phone: "08022222222" }]);
  const months = buildLoanMonths([
    { Phone: "08022222222", LOANAMOUNT: 75, LOANDATE: "2026-08-15" },
  ], phoneRefs);
  assert.equal(months.length, 1);
  assert.equal(months[0]?.ref, "refc");
});

test("a phone that maps to several REFs never guesses the customer", () => {
  const phoneRefs = buildPhoneRefs([
    { ref: "refd", phone: "08033333333" },
    { ref: "refe", phone: "08033333333" },
  ]);
  const months = buildLoanMonths([
    { Phone: "08033333333", LOANAMOUNT: 75, LOANDATE: "2026-08-15" },
  ], phoneRefs);
  assert.equal(months.length, 0);
});

test("loyal customer columns are picked up by header", () => {
  const [customer] = buildCustomers([
    {
      Ref: "reff",
      Phone: "08044444444",
      "Organisation_Name": "Test Org",
      "PL Limit": 1000,
      "PL Balance Current": 250,
      "Loyal Customer": "Y",
      "Loyal Customer Target": 500,
      "Loyal Customer Target Achieved": 250,
      "Loyal Customer (% Achieved)": "50%",
    },
  ]);
  assert.equal(customer?.ref, "reff");
  assert.equal(customer?.loyal_customer, "Y");
  assert.equal(customer?.loyal_target, 500);
  assert.equal(customer?.loyal_target_achieved, 250);
  assert.equal(customer?.loyal_pct, 50);
});

test("customers without loyal columns still build with empty loyal fields", () => {
  const [customer] = buildCustomers([
    { Ref: "refg", Phone: "08055555555", "PL Limit": 100, "PL Balance Current": 10 },
  ]);
  assert.equal(customer?.loyal_customer, null);
  assert.equal(customer?.loyal_target, null);
});
