const User = require("../models/user_model");
const Book = require("../models/Book");

exports.recommendBooks = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all books
    const books = await Book.find().lean();

    // Get user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Books rated 4 or 5
    const ratedBooks = books.filter(b =>
      b.ratings.some(r => r.userId.toString() === userId && r.rating >= 4)
    );

    if (ratedBooks.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: "Rate some books first for better recommendations."
      });
    }

    // Collect liked subjects
    let subjectsLiked = new Set();
    ratedBooks.forEach(b => {
      if (Array.isArray(b.subjects)) b.subjects.forEach(s => subjectsLiked.add(s));
    });

    // Group 1: Similar subjects
    const sameSubject = books.filter(b =>
      !b.ratings.some(r => r.userId.toString() === userId) &&
      Array.isArray(b.subjects) &&
      b.subjects.some(s => subjectsLiked.has(s))
    ).map(b => ({ ...b, reason: "Similar subject" }));

    // Group 2: Most liked books (highest avg rating)
    const mostLiked = [...books]
      .filter(b => !b.ratings.some(r => r.userId.toString() === userId))
      .map(b => {
        const avgRating = b.ratings.length
          ? b.ratings.reduce((sum, r) => sum + r.rating, 0) / b.ratings.length
          : 0;
        return { ...b, avgRating, reason: "Most liked in database" };
      })
      .sort((a, b) => b.avgRating - a.avgRating);

    // Group 3: Popular books (highest number of ratings)
    const popular = [...books]
      .filter(b => !b.ratings.some(r => r.userId.toString() === userId))
      .sort((a, b) => (b.ratings?.length || 0) - (a.ratings?.length || 0))
      .map(b => ({ ...b, reason: "Popular book" }));

    // Build final recommendations
    let recommendations = [
      ...sameSubject.slice(0, 7),
      ...mostLiked.slice(0, 2),
      ...popular.slice(0, 1)
    ];

    // Ensure exactly 10 (fallback: fill with popular if needed)
    if (recommendations.length < 10) {
      const extraNeeded = 10 - recommendations.length;
      recommendations = [
        ...recommendations,
        ...popular.slice(0, extraNeeded)
      ];
    }

    res.status(200).json({
      count: recommendations.length,
      recommendations: recommendations.map(b => ({
        work_key: b.work_key,
        title: b.title,
        authors: b.authors,
        coverImage: b.coverImage,
        reason: b.reason
      }))
    });

  } catch (err) {
    console.error("RecommendBooks error:", err.message);
    res.status(500).json({ message: "Error generating recommendations." });
  }
};
