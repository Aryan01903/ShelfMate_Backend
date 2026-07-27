const User = require("../models/user_model");
const Book = require("../models/Book");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set — recommendations will fail.");
}

const OPENLIBRARY_TIMEOUT = 3000;

const normalizeCoverId = (id) => {
  if (!id) return null;
  const num = parseInt(id);
  return isNaN(num) ? null : num;
};

const getCoverImage = (coverId) => {
  if (coverId) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }
  return "/images/book-placeholder.png";
};

const isValidAuthor = (a) => {
  return a && a !== "N/A" && a !== "Unknown";
};

const normalizeWorkKey = (workKey) => {
  if (!workKey) return null;
  return workKey.replace(/^\/?works\//, "");
};

const fetchCoverAndAuthor = async (workKey) => {
  const result = { coverId: null, author: null };
  try {
    const key = normalizeWorkKey(workKey);
    const workRes = await axios.get(
      `https://openlibrary.org/works/${key}.json`,
      { timeout: OPENLIBRARY_TIMEOUT },
    );

    result.coverId = workRes.data.covers?.[0] || null;

    const authorKey = workRes.data.authors?.[0]?.author?.key;
    if (authorKey) {
      try {
        const authorRes = await axios.get(
          `https://openlibrary.org${authorKey}.json`,
          { timeout: OPENLIBRARY_TIMEOUT },
        );
        result.author = authorRes.data.name || null;
      } catch {
      }
    }
  } catch {
  }
  return result;
};

const sampleRandom = (arr, n) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

exports.recommendBooks = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const books = await Book.find().lean();

    const likedBooks = books.filter((b) =>
      b.ratings?.some(
        (r) => r.userId?.toString() === userId && r.rating >= 4,
      ),
    );

    if (likedBooks.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: "Rate some books first.",
      });
    }

    const likedWorkKeys = new Set(likedBooks.map((b) => b.work_key));
    const likedTitles = likedBooks.map((b) => b.title);
    const likedSubjects = [
      ...new Set(likedBooks.flatMap((b) => b.subjects || [])),
    ];

    const candidatePool = books.filter((b) => !likedWorkKeys.has(b.work_key));
    const bookPool = sampleRandom(candidatePool, 50).map((b) => ({
      work_key: b.work_key,
      title: b.title,
      subjects: b.subjects || [],
    }));

    const prompt = `
You are a recommendation engine.

Return ONLY valid JSON array.
No explanation. No markdown.

User likes:
Books: ${likedTitles.join(", ")}
Subjects: ${likedSubjects.join(", ")}

Recommend EXACTLY 12 books from this list:
${JSON.stringify(bookPool)}

Rules:
- Exclude already liked books
- No duplicate work_key values in your output
- Only pick from provided list
- Do NOT return "N/A" or "Unknown" as author

Output format:
[
 {
   "work_key": "...",
   "author": "...",
   "reason": "..."
 }
]
`;

    let aiRecommendations = [];

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.6,
          responseMimeType: "application/json",
        },
      });

      let raw = response?.text;
      if (!raw) {
        throw new Error("Empty response from Gemini");
      }

      raw = raw
        .replace(/```json|```/g, "")
        .replace(/\n/g, " ")
        .trim();

      const parsed = JSON.parse(raw);
      aiRecommendations = Array.isArray(parsed)
        ? parsed
        : parsed.recommendations || [];
    } catch (err) {
      console.error("Gemini call/parse failed:", err.message);
    }

    const seenKeys = new Set();
    aiRecommendations = aiRecommendations.filter((rec) => {
      if (!rec?.work_key) return false;
      if (likedWorkKeys.has(rec.work_key)) return false;
      if (seenKeys.has(rec.work_key)) return false;
      seenKeys.add(rec.work_key);
      return true;
    });

    let validRecommendations = await Promise.all(
      aiRecommendations.map(async (rec) => {
        const fullBook = books.find((b) => b.work_key === rec.work_key);
        if (!fullBook) return null;

        let coverId = fullBook.cover_i || normalizeCoverId(rec.cover_id);
        let author = fullBook.author_name?.[0];
        let needsAuthor = !isValidAuthor(author) && !isValidAuthor(rec.author);

        if (!coverId || needsAuthor) {
          const fetched = await fetchCoverAndAuthor(fullBook.work_key);
          if (!coverId) coverId = fetched.coverId;
          if (needsAuthor) author = fetched.author;
        }

        if (!isValidAuthor(author)) {
          author = isValidAuthor(rec.author) ? rec.author : "Unknown";
        }

        return {
          work_key: fullBook.work_key,
          title: fullBook.title,
          author: author || "Unknown",
          cover_image: getCoverImage(coverId),
          reason: rec.reason || "Recommended for you",
        };
      }),
    );

    validRecommendations = validRecommendations.filter(Boolean);

    if (validRecommendations.length < 12) {
      const usedKeys = new Set(validRecommendations.map((r) => r.work_key));
      const needed = 12 - validRecommendations.length;

      const fallbackPool = books
        .filter((b) => !likedWorkKeys.has(b.work_key))
        .filter((b) => !usedKeys.has(b.work_key))
        .filter(
          (b) => !b.ratings?.some((r) => r.userId?.toString() === userId),
        );

      const fallback = sampleRandom(fallbackPool, needed).map((b) => ({
        work_key: b.work_key,
        title: b.title,
        author: b.author_name?.[0] || "Unknown",
        cover_image: getCoverImage(b.cover_i),
        reason: "Popular pick for you",
      }));

      validRecommendations = [...validRecommendations, ...fallback];
    }

    validRecommendations = validRecommendations.slice(0, 12);

    return res.status(200).json({
      count: validRecommendations.length,
      recommendations: validRecommendations,
      usedFallback: validRecommendations.some(
        (r) => r.reason === "Popular pick for you",
      ),
    });
  } catch (err) {
    console.error("========== RECOMMENDATION ERROR ==========");
    console.error(err);

    return res.status(500).json({
      message: "Error generating recommendations.",
      error: err.message || "Unknown error",
    });
  }
};