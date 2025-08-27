const bookController=require("../controllers/book_controller");
const authMW=require("../middlewares/auth_mw")
const express=require("express");
const bookRecommendation= require('../controllers/bookRecommendTensorFlow')

module.exports=(app)=>{

    const router=express.Router()

    // search books
    router.get("/search",bookController.searchBooks);

    router.get("/recommendBooks",authMW.verifyToken,bookRecommendation.recommendBooks)

    // rate book from 1-5
    router.post("/rate",authMW.verifyToken,bookController.rateBook);
    router.get("/rate", authMW.verifyToken, bookController.getRatingsForBooks);
    
    app.use("/shelfmate/api/books",router);
}




