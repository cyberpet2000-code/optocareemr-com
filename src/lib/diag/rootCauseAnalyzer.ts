export function analyzeRootCause(issueName: string, data?: any) {
  const message = String(data?.error_message ?? data?.message ?? issueName ?? "").toLowerCase();
  const page = String(data?.page_name ?? "").toLowerCase();

  if (message.includes("useref is not defined")) {
    return {
      cause: "Patient Record calls React useRef() without importing useRef.",
      fix: 'Add useRef to the React import in src/pages/PatientRecord.tsx: import { useState, useEffect, useRef } from "react";',
      confidence: 99,
    };
  }

  if (message.includes("column \"quantity\"") && message.includes("inventory")) {
    return {
      cause: 'Column "quantity" does not exist in inventory table.',
      fix: 'Use "stock_quantity" instead.',
      confidence: 98,
    };
  }

  if (message.includes("column \"quantity\"") && message.includes("drugs")) {
    return {
      cause: 'Column "quantity" does not exist in drugs table.',
      fix: 'Use "stock" instead.',
      confidence: 98,
    };
  }

  if (message.includes("column \"stock_quantity\"") && message.includes("drugs")) {
    return {
      cause: 'Column "stock_quantity" does not exist on drugs table.',
      fix: 'Drugs table uses "stock".',
      confidence: 99,
    };
  }

  if (issueName.toLowerCase().includes("revenue mismatch")) {
    return {
      cause: "Dashboard revenue calculation differs from billing totals.",
      fix: "Verify dashboard and billing use the same revenue source.",
      confidence: 85,
    };
  }

  if (message.includes("referenceerror") || message.includes(" is not defined")) {
    return {
      cause: "A JavaScript/React symbol is being used before it is defined or imported.",
      fix: "Inspect the affected component import list and the first stack-frame source location.",
      confidence: 90,
    };
  }

  if (page.includes("patient record")) {
    return {
      cause: "Patient Record failed during React rendering.",
      fix: "Inspect the PatientRecord component and the first application stack frame.",
      confidence: 65,
    };
  }

  return {
    cause: "Unknown",
    fix: "Manual investigation required.",
    confidence: 10,
  };
}
