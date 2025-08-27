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

    // Collect liked subjects, authors, genres
    let subjectsLiked = new Set();
    let authorsLiked = new Set();
    let genresLiked = new Set();

    ratedBooks.forEach(b => {
      if (Array.isArray(b.subjects)) b.subjects.forEach(s => subjectsLiked.add(s));
      if (Array.isArray(b.authors)) b.authors.forEach(a => authorsLiked.add(a));
      if (Array.isArray(b.genres)) b.genres.forEach(g => genresLiked.add(g));
    });

    // Helper: build groups
    const sameSubject = [];
    const sameAuthor = [];
    const sameGenre = [];
    const extra = [];

    books.forEach(b => {
      // Skip already rated
      if (b.ratings.some(r => r.userId.toString() === userId)) return;

      if (Array.isArray(b.subjects) && b.subjects.some(s => subjectsLiked.has(s))) {
        sameSubject.push({ ...b, reason: "Similar subject" });
      } else if (Array.isArray(b.authors) && b.authors.some(a => authorsLiked.has(a))) {
        sameAuthor.push({ ...b, reason: "Same author" });
      } else if (Array.isArray(b.genres) && b.genres.some(g => genresLiked.has(g))) {
        sameGenre.push({ ...b, reason: "Similar genre" });
      } else {
        extra.push({ ...b, reason: "Popular/extra recommendation" });
      }
    });

    // Pick as per requirement:
    const recommendations = [
      ...sameSubject.slice(0, 4),
      ...sameAuthor.slice(0, 3),
      ...sameGenre.slice(0, 2),
      ...extra.slice(0, 1)
    ];

    res.status(200).json({
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
