const User = require("../models/user_model");
const Book = require("../models/Book");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

exports.recommendBooks = async (req, res) => {
  try {
    const userId = req.user.id;

    const books = await Book.find().limit(200).lean();
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const likedBooks = books.filter((b) =>
      b.ratings.some(
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

Return ONLY JSON array.

User likes:
Books: ${likedTitles.join(", ")}
Subjects: ${likedSubjects.join(", ")}

Recommend 10 books from this list:
${JSON.stringify(bookPool)}

Rules:
- Exclude liked books
- No duplicates
- Only pick from provided list
- Output format:
[
 { "work_key": "...", "title": "...", "reason": "..." }
]
`;

    const completion = await client.chat.completions.create({
      model: "gemini-1.5-flash",
      messages: [
        { role: "system", content: "Strict JSON output only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    let aiRecommendations = [];

    try {
      const parsed = JSON.parse(
        completion.choices[0].message.content
      );

      aiRecommendations = Array.isArray(parsed)
        ? parsed
        : parsed.recommendations || [];
    } catch (err) {
      console.error("JSON parse failed:", err.message);
    }

    const validRecommendations = aiRecommendations.filter((rec) =>
      bookPool.some((b) => b.work_key === rec.work_key)
    );

    if (validRecommendations.length < 5) {
      const fallback = books
        .filter(
          (b) =>
            !b.ratings.some((r) => r.userId.toString() === userId)
        )
        .slice(0, 10)
        .map((b) => ({
          work_key: b.work_key,
          title: b.title,
          reason: "Popular fallback",
        }));

      return res.status(200).json({
        message: "Fallback recommendations",
        recommendations: fallback,
      });
    }

    res.status(200).json({
      count: validRecommendations.length,
      recommendations: validRecommendations,
    });
  } catch (err) {
    console.error("RecommendBooks error:", err.message);
    res.status(500).json({ message: "Error generating recommendations." });
  }
};