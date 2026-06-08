const bcryptjs=require("bcryptjs")
const user_model=require("../models/user_model")
const jwt=require("jsonwebtoken")
const otp_model=require("../models/otp_model")
const sendEmail=require("../utils/sendEmail")

require('dotenv').config();

const generateOtp=()=>{
    return Math.floor(100000+Math.random()*900000).toString();
}

exports.sendOtp=async (req,res)=>{
    const {email} = req.body;
    if(!email){
        return res.status(400).send({
            message : "Email is required"
        })
    }
    try{
        const existingUser=await user_model.findOne({email});
        if(existingUser){
            return res.status(400).send({
                message : "User already exists with this email"
            })
        }
        const otp=generateOtp();
        await otp_model.deleteMany({email}); 
        await otp_model.create({email,otp}); 

        await sendEmail( email, otp );
        return res.status(200).send({
            message : "OTP sent successfully to email"
        })
    }catch(err){
        console.log("OTP send Error: ",err);
        return res.status(500).send({
            message : "Failed to send OTP"
        })
    }
}
// Verify OTP & Register User
exports.verifyOtpAndSignup = async (req, res) => {
    const { email, otp, name, userId, password } = req.body;

    try {
        const otpRecord = await otp_model.findOne({ email });

        if (!otpRecord || otpRecord.otp !== otp) {
            return res.status(400).send({ message: "Invalid or expired OTP" });
        }

        const hashedPassword = bcryptjs.hashSync(password, 8);

        const newUser = await user_model.create({
            name,
            email,
            userId,
            password: hashedPassword
        });

        await otp_model.deleteMany({ email }); // Clean up OTPs

        return res.status(201).send({
            message: "User registered successfully",
            user: {
                name: newUser.name,
                email: newUser.email,
                userId: newUser.userId,
                createdAt: newUser.createdAt,
                updatedAt : newUser.updatedAt
            }
        });

    } catch (err) {
        console.error("Signup Error:", err);
        return res.status(500).send({ message: "Registration failed" });
    }
};


exports.signin = async (req, res) => {
    try {
        const { identifier, password } = req.body;
        // Validate request body
        if (!identifier || !password) {
            return res.status(400).send({
                message: "Both identifier (userId or email) and password must be provided",
            });
        }

        // Check if the identifier is an email or userId
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

        // Query user by email or userId, making sure to select password field
        const user = await user_model.findOne(isEmail ? { email: identifier } : { userId: identifier }).select("+password");

        // Check if user is found
        if (!user) {
            return res.status(400).send({
                message: "User id or Email id does not exist",
            });
        }

        // Check if password is valid
        if (!user.password) {
            return res.status(500).send({
                message: "Password is not available for this user.",
            });
        }

        // Compare the provided password with the hashed password stored in the database
        const isPasswordValid = bcryptjs.compareSync(password, user.password);

        // If password doesn't match
        if (!isPasswordValid) {
            return res.status(401).send({
                message: "Incorrect password",
            });
        }

        // Generate JWT token for the user
        const token = jwt.sign({ id: user.userId }, process.env.secret, {
            expiresIn: "1h" // JWT expiry time (One hour)
        });

        // Send response with token and user details
        return res.status(200).send({
            name: user.name,
            userId: user.userId,
            email: user.email,
            accessToken: token,
        });
    } catch (err) {
        console.log("signin error:", err);
        return res.status(500).send({
            message: "Internal server error",
        });
    }
};