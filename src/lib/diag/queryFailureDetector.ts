import { diag } from "./diag";

export function checkQueryFailure(
  table: string,
  operation: string,
  error: any
) {
  if (!error) return;

  diag.error(
    "query",
    `${table}-query-failed`,
    error,
    {
      table,
      operation,
      code: error.code,
      status: error.status,
      message: error.message,
    }
  );
}
