const MODELS = {
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC": "https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main",
};

export default async function handler(req, res) {
  const modelId = typeof req.query?.model === "string" ? req.query.model : "";
  const pathValue = typeof req.query?.path === "string"
    ? req.query.path
    : Array.isArray(req.query?.path)
      ? req.query.path.join("/")
      : "";

  const baseUrl = MODELS[decodeURIComponent(modelId)];

  if (!baseUrl || !pathValue) {
    return res.status(400).json({ error: "Invalid clinical AI model path." });
  }

  const assetPath = pathValue
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");

  try {
    const response = await fetch(`${baseUrl}/${assetPath}`);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Clinical AI model asset request failed.",
        status: response.status,
      });
    }

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    return res.status(200).send(Buffer.from(await response.arrayBuffer()));
  } catch {
    return res.status(502).json({
      error: "Unable to retrieve the clinical AI model asset.",
    });
  }
}
