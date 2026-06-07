<div className="space-y-2">
  <div>
    System Status:
    {" "}
    {openIssues.length === 0
      ? "Healthy"
      : "Warning"}
  </div>

  <div>
    Open Technical Issues:
    {openIssues.length}
  </div>

  <div>
    Resolved Issues:
    {resolvedIssues.length}
  </div>

  <div>
    Performance:
    Stable
  </div>

  <div>
    Database:
    Healthy
  </div>

  <div>
    API Connectivity:
    Healthy
  </div>
</div>
