const mongoose = require('mongoose');

const connectDB = async() =>{
    try{
        await mongoose.connect(process.env.MONGO_URI, {
            // Default pool is 100 but was never set explicitly, so it was
            // silently relying on the driver default. Pinning it makes the
            // ceiling explicit and tunable, and minPoolSize keeps a few
            // connections warm instead of paying connection setup cost on
            // the first requests after an idle period.
            maxPoolSize: 50,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 10000,
        })
    console.log("MongoDB connected✅")
    }catch(error){
        console.error(error.message)
        process.exit(1)
    }

    mongoose.connection.on("disconnected", () => {
        console.error("MongoDB disconnected — attempting to reconnect...")
    })
    mongoose.connection.on("reconnected", () => {
        console.log("MongoDB reconnected✅")
    })
}
module.exports = connectDB;