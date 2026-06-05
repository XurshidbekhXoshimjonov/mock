require("dotenv").config();

const express =
require("express");

const path =
require("path");

const mongoose =
require("mongoose");

const bcrypt =
require("bcryptjs");

const multer =
require("multer");

const User =
require("./models/User");

const app = express();

const fs = require("fs");
const pdf = require("pdf-parse");


/* MULTER */

const storage =
multer.diskStorage({

    destination:
    (req, file, cb) => {

        cb(
            null,
            "uploads"
        );

    },




    filename:
    (req, file, cb) => {

        cb(

            null,

            Date.now() +

            "-" +

            file.originalname

        );

    }

});




const upload =
multer({

    storage

});




/* MIDDLEWARE */

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(
    express.static(
        path.join(__dirname)
    )
);




/* HOME PAGE */

app.get("/", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "ieltsmock.html"
        )

    );

});




/* ADMIN PAGE */

app.get("/admin", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "admin.html"
        )

    );

});




/* LOGIN PAGE */

app.get("/login", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "login.html"
        )

    );

});




/* SIGNUP PAGE */

app.get("/signup", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "signup.html"
        )

    );

});




/* PDF UPLOAD */

app.post("/upload", upload.single("pdf"), async (req, res) => {

    try{

        const filePath = req.file.path;

        const dataBuffer =
        fs.readFileSync(filePath);

        const data =
        await pdf(dataBuffer);

        const text =
        data.text;

     console.log(text);

fs.writeFileSync(
    path.join(__dirname, "output.txt"),
    text
);

res.send(
    "PDF uploaded + parsed successfully"
);}

    catch(error){

        console.log(error);

        res.send("Upload failed");

    }

});




/* SIGNUP API */

app.post("/signup", async (req, res) => {

    try{

        const {
            username,
            email,
            password
        } = req.body;




        const hashedPassword =
        await bcrypt.hash(

            password,

            10

        );




        const newUser =
        new User({

            username,

            email,

            password:
            hashedPassword

        });




        await newUser.save();




        res.send(
            "User created successfully"
        );

    }

    catch(error){

        console.log(error);

        res.send(
            "Signup failed"
        );

    }

});




/* LOGIN API */

app.post("/login", async (req, res) => {

    try{

        const {
            email,
            password
        } = req.body;




        const user =
        await User.findOne({

            email

        });




        if(!user){

            return res.send(
                "User not found"
            );

        }




        const isMatch =
        await bcrypt.compare(

            password,

            user.password

        );




        if(!isMatch){

            return res.send(
                "Wrong password"
            );

        }




        res.send(
            "Login successful"
        );

    }

    catch(error){

        console.log(error);

        res.send(
            "Login failed"
        );

    }

});




/* DATABASE */

mongoose.connect(
    process.env.MONGO_URI
)

.then(() => {

    console.log(
        "MongoDB connected"
    );

})

.catch((error) => {

    console.log(error);

});




/* SERVER */

const PORT =
process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});