export { diag, type DiagArea } from "./diag";
export { isDiagEnabled, setDiagEnabled } from "./diagConfig";
export { installDiagFetchPatch } from "./diagFetchPatch";
export {
  startLoadingWatch,
  stopLoadingWatch,
} from "./loadingDetector";
export { installRuntimeErrorDetector } from "./runtimeErrorDetector";
export { default as DiagOverlay } from "./DiagOverlay";
export { checkQueryFailure } from "./queryFailureDetector";
export {
  reportIssue,
  resolveIssue,
  getIssues,
} from "./issueTracker";
export { analyzeRootCause }
from "./rootCauseAnalyzer";
export { classifyIssue }
from "./issueClassifier";
export { analyzeTrend }
from "./trendAnalyzer";
export { analyzePriority } from "./priorityAnalyzer";
export { forecastHealth } from "./healthForecast";
export { getExecutiveSummary } from "./executiveSummary";
export { runSelfHealing, reportHealingResult } from "./selfHealing";

