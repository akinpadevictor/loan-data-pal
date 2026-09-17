# Add monthly credit-risk metrics

## Changes
- Show **Organization Name** clearly in the customer result.
- Add monthly **Interest Accrued**, calculated from `Total Interest Accrued` in the Loan Information file.
- Rename the existing average aging row to **Loan Aging** and keep its monthly average-day calculation.
- Add monthly **NPL Value**, calculated as the total pending amount on loans whose aging is above 20 days.
- Show **Possible NPL** beside a month’s loan-aging value whenever it is above 20 days.
- Remove **Repayments received** from the monthly table.

## Data updates
- Add `interest_accrued` and `npl_value` to stored customer-month records.
- Update daily spreadsheet processing so future Loan Information uploads calculate both fields automatically.
- Recalculate and load these figures from the currently uploaded Loan Information file so existing customers show them immediately.

## Technical details
- Interest accrued: monthly sum of `Total Interest Accrued` for each customer’s loans taken that month.
- Loan aging: monthly average of the numeric days in `Loan Aging`.
- NPL value: monthly sum of `Total Amount Pending` for loans with `Loan Aging > 20` days.
- Preserve the existing four-month window and additional-month selection behavior.
