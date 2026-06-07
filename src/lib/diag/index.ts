export { diag, type DiagArea } from "./diag";
export { isDiagEnabled, setDiagEnabled } from "./diagConfig";
export { installDiagFetchPatch } from "./diagFetchPatch";
export { installRuntimeErrorDetector } from "./runtimeErrorDetector";
export { default as DiagOverlay } from "./DiagOverlay";
export {
  startLoadingWatch,
  stopLoadingWatch,
} from "./loadingDetector";
