import LegalLayout from "./LegalLayout";

export default function SubscriptionRefund() {
  return <LegalLayout title="Subscription, Cancellation & Data Exit" description="Commercial and account-exit rules for OptoCare-EMR subscriptions.">
    <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
    <h2>1. Billing</h2><p>Fees, billing intervals and included features are those shown at purchase or in the applicable order. Applicable taxes and payment-provider charges may apply.</p>
    <h2>2. Renewal</h2><p>Recurring subscriptions renew unless cancelled before the next renewal date. Cancellation normally stops the next renewal and does not retroactively cancel a completed billing period.</p>
    <h2>3. Refunds</h2><p>Refund eligibility depends on the plan, applicable law and the circumstances of the request. Nothing in this policy excludes a refund or remedy that applicable law requires.</p>
    <h2>4. Non-Payment</h2><p>Failed or overdue payments may lead to reminders, restricted features or suspension after reasonable notice where practicable.</p>
    <h2>5. Data Exit</h2><p>Customers should request required exports before termination. OptoCare will provide supported exports subject to reasonable verification and applicable retention obligations.</p>
    <h2>6. Deletion</h2><p>After the applicable exit and retention period, active Customer Data may be deleted and backup copies may expire through normal backup cycles.</p>
  </LegalLayout>;
}
