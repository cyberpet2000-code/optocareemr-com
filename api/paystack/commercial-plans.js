export const COMMERCIAL_PLANS = Object.freeze({
  starter_monthly: {
    plan: "starter",
    cadence: "monthly",
    amountNaira: 10000,
    paystackEnv: "PAYSTACK_PLAN_CODE_STARTER_MONTHLY",
  },
  starter_annual: {
    plan: "starter",
    cadence: "annual",
    amountNaira: 100000,
    paystackEnv: "PAYSTACK_PLAN_CODE_STARTER_ANNUAL",
  },
  professional_monthly: {
    plan: "professional",
    cadence: "monthly",
    amountNaira: 18000,
    paystackEnv: "PAYSTACK_PLAN_CODE_PROFESSIONAL_MONTHLY",
  },
  professional_annual: {
    plan: "professional",
    cadence: "annual",
    amountNaira: 180000,
    paystackEnv: "PAYSTACK_PLAN_CODE_PROFESSIONAL_ANNUAL",
  },
  clinic_monthly: {
    plan: "clinic",
    cadence: "monthly",
    amountNaira: 30000,
    paystackEnv: "PAYSTACK_PLAN_CODE_CLINIC_MONTHLY",
  },
  clinic_annual: {
    plan: "clinic",
    cadence: "annual",
    amountNaira: 300000,
    paystackEnv: "PAYSTACK_PLAN_CODE_CLINIC_ANNUAL",
  },
});

export function getCommercialPlan(key) {
  return Object.prototype.hasOwnProperty.call(COMMERCIAL_PLANS, key)
    ? COMMERCIAL_PLANS[key]
    : null;
}

export function getExpectedPaystackPlanCode(key) {
  const config = getCommercialPlan(key);
  return config ? process.env[config.paystackEnv] || null : null;
}

export function getCanonicalPlanFromPaystackCode(code) {
  if (!code) return null;
  for (const [key, config] of Object.entries(COMMERCIAL_PLANS)) {
    if (process.env[config.paystackEnv] && process.env[config.paystackEnv] === code) {
      return { key, ...config };
    }
  }
  return null;
}
