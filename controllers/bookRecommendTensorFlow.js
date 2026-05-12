const User = require("../models/user_model");
const Book = require("../models/Book");
const OpenAI = require("openai");
const axios = require("axios");

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});


const normalizeCoverId = (id) => {
  if (!id) return null;
  const num = parseInt(id);
  return isNaN(num) ? null : num;
};

const getCoverImage = (coverId) => {
  if (coverId) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }
  return "https://via.placeholder.com/150";
};

const isValidAuthor = (a) => {
  return a && a !== "N/A" && a !== "Unknown";
};

const fetchCoverId = async (workKey) => {
  try {
    const res = await axios.get(
      `https://openlibrary.org/works/${workKey}.json`
    );
    return res.data.covers?.[0] || null;
  } catch {
    return null;
  }
};

const fetchAuthor = async (workKey) => {
  try {
    const workRes = await axios.get(
      `https://openlibrary.org/works/${workKey}.json`
    );

    const authorKey =
      workRes.data.authors?.[0]?.author?.key;

    if (!authorKey) return null;

    const authorRes = await axios.get(
      `https://openlibrary.org${authorKey}.json`
    );

    return authorRes.data.name || null;
  } catch {
    return null;
  }
};


exports.recommendBooks = async (req, res) => {
  try {
    const userId = req.user.id;

    const books = await Book.find().limit(200).lean();
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // ---------------- LIKED BOOKS ----------------

    const likedBooks = books.filter((b) =>
      b.ratings?.some(
        (r) => r.userId.toString() === userId && r.rating >= 4
      )
    );

    if (likedBooks.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: "Rate some books first.",
      });
    }

    const likedTitles = likedBooks.map((b) => b.title);
    const likedSubjects = [
      ...new Set(likedBooks.flatMap((b) => b.subjects || [])),
    ];


    const bookPool = books.slice(0, 50).map((b) => ({
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
- No duplicates
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

    const completion = await client.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Strict JSON output only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });


    let aiRecommendations = [];

    try {
      let raw = completion.choices[0].message.content;

      raw = raw
        .replace(/```json|```/g, "")
        .replace(/\n/g, " ")
        .trim();

      const parsed = JSON.parse(raw);

      aiRecommendations = Array.isArray(parsed)
        ? parsed
        : parsed.recommendations || [];
    } catch (err) {
      console.error("JSON parse failed:", err.message);
    }


    let validRecommendations = await Promise.all(
      aiRecommendations.map(async (rec) => {
        const fullBook = books.find(
          (b) => b.work_key === rec.work_key
        );

        if (!fullBook) return null;

        let coverId =
          fullBook.cover_i || normalizeCoverId(rec.cover_id);

        if (!coverId) {
          coverId = await fetchCoverId(fullBook.work_key);
        }

        let author = fullBook.author_name?.[0];

        if (!isValidAuthor(author)) {
          author = rec.author;
        }

        if (!isValidAuthor(author)) {
          author = await fetchAuthor(fullBook.work_key);
        }

        return {
          work_key: fullBook.work_key,
          title: fullBook.title,
          author: author || "Unknown",
          cover_image: getCoverImage(coverId),
          reason: rec.reason || "Recommended for you",
        };
      })
    );

    validRecommendations = validRecommendations.filter(Boolean);


    if (validRecommendations.length < 5) {
      const fallback = books
        .filter(
          (b) =>
            !b.ratings?.some(
              (r) => r.userId.toString() === userId
            )
        )
        .slice(0, 12)
        .map((b) => ({
          work_key: b.work_key,
          title: b.title,
          author: b.author_name?.[0] || "Unknown",
          cover_image: getCoverImage(b.cover_i),
          reason: "Popular fallback",
        }));

      return res.status(200).json({
        message: "Fallback recommendations",
        count: fallback.length,
        recommendations: fallback,
      });
    }

    validRecommendations = validRecommendations.slice(0, 12);

    return res.status(200).json({
      count: validRecommendations.length,
      recommendations: validRecommendations,
    });

  } catch (err) {
    console.error("RecommendBooks error:", err.message);
    return res.status(500).json({
      message: "Error generating recommendations.",
    });
  }
};