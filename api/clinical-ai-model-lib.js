export default async function handler(req, res) {
  const source = typeof req.query?.source === "string" ? req.query.source : "";

  if (!source || !/^https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\//.test(source)) {
    return res.status(400).json({ error: "Invalid model source." });
  }

  try {
    const response = await fetch(source);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Model asset request failed.",
        status: response.status,
      });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (contentLength) res.setHeader("Content-Length", contentLength);

    const buffer = Buffer.from(await response.arrayBuffer());
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(502).json({
      error: "Unable to retrieve the local AI model asset.",
    });
  }
}
