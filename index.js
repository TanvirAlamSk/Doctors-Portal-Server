const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

app.use(cors());
// app.use(express.static("public"))
app.use(express.json())



app.get("/", (req, res) => {
    res.send("Server is Running");
})


const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASSWORD}@cluster0.7xhaxuz.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ massage: "Unauthorized Access" })
    }
    const token = req.headers.authorization.split(" ")[1]
    jwt.verify(token, process.env.JWT_TOKEN, function (error, decode) {
        if (error) {
            return res.status(403).send({ massage: "Forbidden Access" })
        }
        req.decoded = decode
        next()
    })
}

async function run() {
    try {
        const appointmentOptions = client.db("doctors-portal").collection("appointmentoptions");
        const bookingCollection = client.db("doctors-portal").collection("bookingCollection");
        const userCollection = client.db("doctors-portal").collection("users");
        const doctorsCollection = client.db("doctors-portal").collection("doctors");
        const paymentCollection = client.db("doctors-portal").collection("payment");

        app.post("/create-payment-intent", async (req, res) => {
            const data = req.body
            const price = data.price
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.post("/jwt", async (req, res) => {
            const token = jwt.sign(req.body, process.env.JWT_TOKEN, { expiresIn: "10h" })
            res.send({ token })
        })

        // 
        const adminVerify = async (req, res, next) => {
            const decodeEmail = req.decoded.email;
            const query = { email: decodeEmail }
            console.log(req.decoded.email)
            const result = await userCollection.findOne(query)

            if (result.role != "Admin") {
                return res.status(403).send({ massage: "Forbidden Access" })
            }
            next()
        }
        // 
        // app.get("/add-price", async (req, res) => {
        //     const query = {}
        //     const option = { upsert: true }
        //     const updateDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptions.updateMany(query, updateDoc, option);
        //     res.send(result);
        // })

        app.get("/appointmentoptions", async (req, res) => {
            const date = req.query.date
            const query = {}
            const cursor = await appointmentOptions.find(query).toArray()
            const bookedQuery = { date: date }
            const alreadyBooked = await bookingCollection.find(bookedQuery).toArray()

            cursor.forEach((option) => {
                const optionBooked = alreadyBooked.filter((booked) => booked.treatment == option.name)

                const bookedSlots = optionBooked.map((bookedSlot) => bookedSlot.slot)

                const remainSlot = option.slots.filter((slot) => !bookedSlots.includes(slot))
                option.slots = remainSlot
            })
            res.send(cursor);
        })

        //get Only for Name And _id
        app.get("/appointment-specialty", async (req, res) => {
            const query = {}
            const cursor = await appointmentOptions.find(query).project({ name: 1 }).toArray()
            res.send(cursor)
        })
        //bookinh

        app.get("/bookings", verifyToken, async (req, res) => {
            const decoded = req.decoded;
            if (decoded.email !== req.query.email) {
                res.status(401).send({ massage: "Unauthorized Access" })
            }
            const query = { email: req.query.email }
            const cursor = await bookingCollection.find(query).toArray()
            res.send(cursor)
        })

        app.get("/bookings/:id", async (req, res) => {
            const query = {
                _id: new ObjectId(req.params.id)
            }
            const cursor = await bookingCollection.findOne(query)
            res.send(cursor);
        })

        app.post("/bookings", async (req, res) => {
            const result = await bookingCollection.insertOne(req.body)
            res.send(result)
        })

        //user
        app.get("/users", async (req, res) => {
            const query = {}
            const cursor = await userCollection.find(query).toArray()
            res.send(cursor)
        })

        app.get("/users/admin/:email", async (req, res) => {
            const userEmail = req.params.email
            const query = { email: userEmail };
            const cursor = await userCollection.findOne(query);
            res.send({ isAdmin: cursor?.role == "Admin" })

        })

        app.put("/users/:id", verifyToken, adminVerify, async (req, res) => {

            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const option = { upsert: true }
            const updateDoc = {
                $set: {
                    role: "Admin"
                }
            }
            const result = await userCollection.updateOne(query, updateDoc, option)
            res.send(result)
        })

        app.post("/users", verifyToken, async (req, res) => {
            const result = await userCollection.insertOne(req.body)
            res.send(result)
        })
        //doctor
        app.get("/doctors", verifyToken, adminVerify, async (req, res) => {
            const query = {};
            const cursor = await doctorsCollection.find(query).toArray()
            res.send(cursor)
        })
        app.post("/doctors", verifyToken, adminVerify, async (req, res) => {
            const result = await doctorsCollection.insertOne(req.body)
            res.send(result)
        })
        app.delete("/doctors/:id", verifyToken, adminVerify, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await doctorsCollection.deleteOne(query)
            res.send(result);
        })

        //payment
        app.post("/payment", async (req, res) => {
            const result = await paymentCollection.insertOne(req.body)
            const id = req.body.bookingId
            const query = { _id: new ObjectId(id) }
            const option = { upsert: true }
            const updateDoc = {
                $set: {
                    paid: true,
                    transectionId: req.body.transectionId
                }
            }
            const updateResult = await bookingCollection.updateOne(query, updateDoc, option)
            res.send(result)
        })

    } finally {

    }

}

run().catch((error) => console.log(error))


app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})