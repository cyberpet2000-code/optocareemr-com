export function analyzeRootCause(issueName: string, data?: any) {
  const message = data?.message?.toLowerCase?.() || "";
  const url = data?.url?.toLowerCase?.() || "";

  if (message.includes('column "quantity"') && message.includes("inventory")) {
    return {
      cause: 'Column "quantity" does not exist in inventory table.',
      fix: 'Use "stock_quantity" instead.',
      confidence: 98,
    };
  }

  if (message.includes('column "quantity"') && message.includes("drugs")) {
    return {
      cause: 'Column "quantity" does not exist in drugs table.',
      fix: 'Use "stock" instead (drugs table uses "stock", not "stock_quantity").',
      confidence: 98,
    };
  }

  if (message.includes('column "stock_quantity"') && message.includes("drugs")) {
    return {
      cause: 'Column "stock_quantity" does not exist on drugs table.',
      fix: 'Drugs table uses "stock". Update query to .lte("stock", n).',
      confidence: 99,
    };
  }

  if (issueName.includes("revenue mismatch")) {
    return {
      cause: "Dashboard revenue calculation differs from billing totals.",
      fix: "Verify dashboard and billing use the same revenue source.",
      confidence: 85,
    };
  }

  void url;
  return {
    cause: "Unknown",
    fix: "Manual investigation required.",
    confidence: 10,
  };
}
