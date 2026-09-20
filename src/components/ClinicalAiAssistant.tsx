import { useState } from "react";
import { Brain, Loader2, Sparkles, AlertTriangle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { analyzeClinicalCase, isClinicalAiSupported, type ClinicalCase, type ClinicalAiProgress } from "@/lib/clinicalAi";

type Props = {
  clinicalCase: ClinicalCase;
  disabled?: boolean;
};

export function ClinicalAiAssistant({ clinicalCase, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ClinicalAiProgress | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError("");
    setAnalysis("");
    setProgress(null);

    try {
      const result = await analyzeClinicalCase(clinicalCase, setProgress);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run OptoCare AI.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next && !analysis && !loading && !error) {
      void runAnalysis();
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-lg px-2.5 text-[10px] font-semibold gap-1.5"
        disabled={disabled}
        onClick={() => handleOpen(true)}
        title="Analyze this clinical case with the local OptoCare AI"
      >
        <Sparkles size={13} />
        Analyze Case
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain size={18} />
              OptoCare Clinical AI
            </DialogTitle>
            <DialogDescription>
              On-demand clinical decision support based only on the findings entered for this visit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                AI suggestions support — and do not replace — the examining optometrist's clinical judgment.
              </AlertDescription>
            </Alert>

            {loading && (
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progress?.text || "Analyzing case..."}
                </div>
                {typeof progress?.progress === "number" && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, progress.progress * 100))}%` }} />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  The first use downloads the local AI model. It is cached for later use.
                </p>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {!isClinicalAiSupported() && !loading && (
              <Alert>
                <WifiOff className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This browser/device does not currently expose WebGPU, so local AI cannot run here.
                </AlertDescription>
              </Alert>
            )}

            {analysis && (
              <ScrollArea className="max-h-[55vh] rounded-2xl border">
                <div className="p-4 whitespace-pre-wrap text-sm leading-6">
                  {analysis}
                </div>
              </ScrollArea>
            )}

            {!loading && (error || !analysis) && isClinicalAiSupported() && (
              <div className="flex justify-end">
                <Button type="button" className="rounded-xl" onClick={() => void runAnalysis()}>
                  <Sparkles size={14} className="mr-1.5" />
                  {error ? "Try Again" : "Analyze"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
