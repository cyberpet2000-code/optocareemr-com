import { diag } from "./diag";
import {
  reportIssue,
  resolveIssue,
} from "./issueTracker";

export function checkQueryFailure(
  table: string,
  action: string,
  error: any
) {
  const issueName =
    `${table}:${action}`;

  if (error) {
    reportIssue(issueName);

    diag.error(
      "query",
      issueName,
      error
    );

    return;
  }

  resolveIssue(issueName);
}
