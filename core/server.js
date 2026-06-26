import express from "express";
import cors from "cors";
import { MeiliSearch } from "meilisearch";
import https from "https";

const MEILI_HOST = process.env.MEILI_HOST || "http://localhost:7700";
const MEILI_KEY = process.env.MEILI_KEY || "vtb-search-key";
const PORT = process.env.PORT || 3001;
const INDEX = "personas";

const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });
const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const page = parseInt(req.query.page) || 1;
    const hitsPerPage = parseInt(req.query.limit) || 20;
    const status = req.query.status || "";
    const genero = req.query.genero || "";

    if (!q && !status && !genero) {
      const stats = await client.index(INDEX).getStats();
      return res.json({ hits: [], total: stats.numberOfDocuments, page, hitsPerPage });
    }

    const filterParts = [];
    if (status === "missing") filterParts.push('status = "missing"');
    if (status === "found") filterParts.push('status = "found"');
    if (genero) filterParts.push(`genero = "${genero}"`);

    const searchParams = {
      limit: hitsPerPage,
      offset: (page - 1) * hitsPerPage,
      attributesToHighlight: [
        "nombre_completo",
        "nombre",
        "apellido",
        "cedula",
        "ultima_ubicacion",
        "descripcion",
      ],
      attributesToCrop: ["descripcion"],
      cropLength: 120,
      showMatchesPosition: true,
    };

    if (filterParts.length) searchParams.filter = filterParts;

    const result = await client.index(INDEX).search(q, searchParams);

    return res.json({
      hits: result.hits,
      total: result.estimatedTotalHits ?? result.totalHits ?? 0,
      page,
      hitsPerPage,
      processingTimeMs: result.processingTimeMs,
      query: result.query,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/persons/:id", async (req, res) => {
  try {
    const doc = await client.index(INDEX).getDocument(req.params.id);
    res.json(doc);
  } catch (err) {
    res.status(404).json({ error: "No encontrado" });
  }
});

app.get("/api/persons/:id/photo", async (req, res) => {
  try {
    const doc = await client.index(INDEX).getDocument(req.params.id);
    if (!doc.tiene_foto || !doc.foto_key) return res.status(404).end();
    const url = `https://venezuelatebusca.com/media/photos/${doc.foto_key}`;
    https.get(url, (proxy) => {
      if (proxy.statusCode >= 400) return res.status(404).end();
      res.set("Cache-Control", "public, max-age=86400");
      proxy.pipe(res);
    }).on("error", () => res.status(502).end());
  } catch (err) {
    res.status(404).json({ error: "No encontrado" });
  }
});

app.get("/api/stats", async (_req, res) => {
  try {
    const stats = await client.index(INDEX).getStats();
    const missing = await client.index(INDEX).search("", {
      filter: ['status = "missing"'],
      limit: 0,
    });
    const found = await client.index(INDEX).search("", {
      filter: ['status = "found"'],
      limit: 0,
    });

    const withPhoto = await client.index(INDEX).search("", {
      filter: ['tiene_foto = true'],
      limit: 0,
    });

    res.json({
      total: stats.numberOfDocuments,
      missing: missing.estimatedTotalHits ?? 0,
      found: found.estimatedTotalHits ?? 0,
      withPhotos: withPhoto.estimatedTotalHits ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/suggestions", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const result = await client.index(INDEX).search(q, {
      limit: 5,
      attributesToRetrieve: ["nombre_completo", "cedula", "edad", "status"],
    });

    res.json(
      result.hits.map((h) => ({
        text: h.nombre_completo,
        cedula: h.cedula,
        status: h.status,
        edad: h.edad,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`VTB Core corriendo en http://localhost:${PORT}`);
  console.log(`MeiliSearch: ${MEILI_HOST}`);
});
