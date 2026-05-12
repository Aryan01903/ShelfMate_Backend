const express=require("express")
const server=require("./configs/server_config")
const mongoose=require("mongoose")
const app=express()
require('dotenv').config()

const cors = require("cors");
app.use(cors({ origin: "*" }));



app.use(express.json());

mongoose.connect(process.env.DB_URL)
.then(() => {
    console.log("Successfully connected to Database");
  })
  .catch((err) => {
    console.log("Error occurred while connecting to the Database:", err.message);
  });

/**
 * Stitch to the Server
 */

const authRoutes=require("./routes/auth_route")
authRoutes(app);

const bookRoutes=require("./routes/book_route");
bookRoutes(app);

/**
 * Starting the Server
*/
app.listen(server.PORT_NUMBER,()=>{
    console.log("Successfully started at the server PORT NUMBER : ",server.PORT_NUMBER)
})