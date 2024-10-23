const express = require("express");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");

const app = express();

// Load environment variables from .env file
dotenv.config({ path: "./.env" });

const db = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_ROOT,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

db.getConnection()
  .then(() => {
    console.log("MySQL connected!");
  })
  .catch((error) => {
    console.log("Error connecting to MySQL:", error);
  });

// Initialize session middleware
app.use(
  session({
    secret: "your_secret_key", // Replace with a random secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // For production, set to true with HTTPS
  })
);

const publicDir = path.join(__dirname, "./public");
app.use(express.static(publicDir)); // Serving static HTML files
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve index.html with session check for username
app.get("/", (req, res) => {
  if (req.session.username) {
    res.send(
      `<h1>Hi, ${req.session.username}</h1>
      <a href="/logout">Logout</a>
      <br>
      <a href="/dashboard">Go to Dashboard</a>`
    );
  } else {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// Serve register.html
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

// Serve the login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Register User Route
app.post("/register", async (req, res) => {
  const { contact_number, signin_password, email, supplier_name, address } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(signin_password, 10);
    const supplier_id = uuidv4(); // Generate unique supplier ID

    // Insert into Supplier table
    await db.query(
      "INSERT INTO Supplier (supplier_id, name, address, phone_number) VALUES (?, ?, ?, ?)",
      [supplier_id, supplier_name, address, contact_number]
    );

    const unique_user_id = uuidv4(); // Generate unique user ID

    // Insert into Sign_In_User_Details
    await db.query(
      "INSERT INTO Sign_In_User_Details (unique_user_id, contact_number, supplier_id, signin_password) VALUES (?, ?, ?, ?)",
      [unique_user_id, contact_number, supplier_id, hashedPassword]
    );

    // Optionally handle multiple emails
    if (email) {
      await db.query(
        "INSERT INTO Sign_In_User_Details_email (unique_user_id, email) VALUES (?, ?)",
        [unique_user_id, email]
      );
    }

    // Set session for the user
    req.session.unique_user_id = unique_user_id;

    // Redirect to index page after successful registration
    return res.redirect("/");

  } catch (error) {
    console.error("Registration failed:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Registration failed" });
    }
  }
});

// Login Route using Contact Number
app.post("/login", async (req, res) => {
  const { contact_number, signin_password } = req.body;

  try {
    const connection = await db.getConnection();
    const [results] = await connection.query(
      "SELECT * FROM Sign_In_User_Details WHERE contact_number = ?",
      [contact_number]
    );

    connection.release();

    if (results.length === 0) {
      return res.redirect("/login?message=An%20error%20occurred");
    }

    const user = results[0];
    const isPasswordMatch = await bcrypt.compare(signin_password, user.signin_password);

    if (!isPasswordMatch) {
      return res.redirect("/login?message=An%20error%20occurred");
    }

    const loginTime = moment().format("YYYY-MM-DD HH:mm:ss");
    await db.query(
      "INSERT INTO sign_in (unique_user_id, sign_in_timestamp) VALUES (?, ?)",
      [user.unique_user_id, loginTime]
    );

    req.session.unique_user_id = user.unique_user_id;

    // Redirect to dashboard after successful login
    res.redirect("/dashboard");

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Dashboard Route
app.get("/dashboard", (req, res) => {
  if (!req.session.unique_user_id) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public", "dashboard.html")); // Serve dashboard HTML
});

// Serve the get quote page
app.get("/get-quote", async (req, res) => {
  if (!req.session.unique_user_id) {
    return res.redirect("/login");
  }

  try {
    const [ships] = await db.query("SELECT name FROM Transport_Vessel");
    const [departurePorts] = await db.query("SELECT port_name, port_location FROM port_departure");
    const [arrivalPorts] = await db.query("SELECT port_name, port_location FROM port_arrival");

    res.sendFile(path.join(__dirname, "public", "get-quote.html"));
  } catch (error) {
    console.error("Error fetching quote data:", error);
    res.status(500).send("Error fetching quote data.");
  }
});

// Fetch ships
app.get('/get-ships', async (req, res) => {
    try {
        const [ships] = await db.query("SELECT name FROM Transport_Vessel");
        res.json(ships);
    } catch (error) {
        console.error("Error fetching ships:", error);
        res.status(500).send("Error fetching ships.");
    }
});

// Fetch departure ports
app.get('/get-departure-ports', async (req, res) => {
    try {
        const [departurePorts] = await db.query("SELECT port_name, port_location FROM port_departure");
        res.json(departurePorts);
    } catch (error) {
        console.error("Error fetching departure ports:", error);
        res.status(500).send("Error fetching departure ports.");
    }
});

// Fetch arrival ports
app.get('/get-arrival-ports', async (req, res) => {
    try {
        const [arrivalPorts] = await db.query("SELECT port_name, port_location FROM port_arrival");
        res.json(arrivalPorts);
    } catch (error) {
        console.error("Error fetching arrival ports:", error);
        res.status(500).send("Error fetching arrival ports.");
    }
});

// Calculate quote based on selected ship and ports
app.post("/calculate-quote", async (req, res) => {
  const { shipid, departurePortId, arrivalPortId, volume, description } = req.body;

  try {
    // Insert product details into the database
    const product_id = uuidv4(); // Generate unique product ID
    await db.query(
      "INSERT INTO product (product_id, description, volume) VALUES (?, ?, ?)",
      [product_id, description, volume]
    );

    // Replace this logic with actual calculation based on your business rules
    const amount = volume * 10; // For example, $10 per unit volume
    res.json({ amount: amount.toFixed(2), product_id }); // Return the amount and product_id
  } catch (error) {
    console.error("Error calculating quote:", error);
    res.status(500).send("Error calculating quote.");
  }
});

// Handle user logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      return res.redirect("/?message=Logout%20failed");
    }
    res.redirect("/login?message=Logged%20out%20successfully");
  });
});

// Start server
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
