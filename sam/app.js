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

// Connect to MySQL
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
    req.session.supplier_id = supplier_id; // Store supplier ID for later use

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
    req.session.supplier_id = user.supplier_id; // Store supplier ID for later use

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

// Calculate quote and store temporarily
app.post("/calculate-quote", async (req, res) => {
  const { shipName, departurePortId, arrivalPortId, volume, description } = req.body;

  try {
    // Fetch ship ID based on the ship name selected
    const [shipResults] = await db.query("SELECT ship_id FROM transport_vessel WHERE name = ?", [shipName]);
    const shipid = shipResults.length > 0 ? shipResults[0].ship_id : null;
    console.log(shipName);

    if (!shipid) {
      return res.status(400).json({ error: "Invalid ship selected." });
    }

    // Replace this logic with actual calculation based on your business rules
    const amount = volume * 10; // For example, $10 per unit volume

    // Store the calculated data in session for later use
    req.session.quoteData = { shipid, departurePortId, arrivalPortId, volume, description, amount };

    res.json({ amount: amount.toFixed(2) }); // Return the amount
  } catch (error) {
    console.error("Error calculating quote:", error);
    res.status(500).send("Error calculating quote.");
  }
});

// Accept Quote: Proceed to receiver details
app.post("/accept-quote", (req, res) => {
  if (!req.session.quoteData) {
    return res.redirect("/get-quote"); // If no quote data, redirect to quote page
  }
  res.redirect("/receiver-details"); // Proceed to enter receiver details
});

// Decline Quote: Redirect to dashboard
app.post("/decline-quote", (req, res) => {
  req.session.quoteData = null; // Clear stored quote data
  res.redirect("/dashboard"); // Redirect to dashboard
});

// Receiver Details Route
app.get("/receiver-details", (req, res) => {
  if (!req.session.quoteData) {
    return res.redirect("/get-quote"); // If no quote data, redirect to quote page
  }
  res.sendFile(path.join(__dirname, "public", "receiver-details.html")); // Serve receiver details HTML
});

// Place Order
app.post("/place-order", async (req, res) => {
  const { receiverName, receiverContact } = req.body;
  const quoteData = req.session.quoteData;

  // Check if quote data exists in session
  if (!quoteData) {
    return res.status(400).send("No quote data found.");
  }

  const order_id = uuidv4(); // Generate unique order ID
  const shipment_id = uuidv4(); // Generate unique shipment ID

  // Extract details from quoteData
  const { shipid, departureportname, volume, amount, description } = quoteData;
  const supplier_id = req.session.supplier_id; // Fetch supplier ID from session

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); // Start transaction

    // Insert product details into the Product table
    const product_id = uuidv4(); // Generate unique product ID
    await connection.query(
      "INSERT INTO product (product_id, description, volume, order_id, ship_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?)",
      [product_id, description, volume, order_id, shipid, supplier_id] // Use shipid from quoteData
    );

    // Insert receiver details into the supplier_receiver table
    await connection.query(
      "INSERT INTO supplier_receiver (supplier_id, receiver_name, receiver_no) VALUES (?, ?, ?)",
      [supplier_id, receiverName, receiverContact]
    );

    // Insert order details into the order_details table
    await connection.query(
      "INSERT INTO order_details (order_id, product_id, supplier_id, order_date, shipment_id) VALUES (?, ?, ?, ?, ?)",
      [order_id, product_id, supplier_id, moment().format("YYYY-MM-DD"), shipment_id]
    );

    // Insert shipment details into the shipment table
    const shipmentDate = moment().format("YYYY-MM-DD"); // Current date
    const estimatedArrivalDate = moment().add(7, 'days').format("YYYY-MM-DD"); // Example: 7 days later
    const departurePortId=connection.query("select departure_port_id from departure_port where name in(?)",[departureportname]);
    await connection.query(
      "INSERT INTO shipment (shipment_id, order_id, shipment_date, estimated_arrival_date, departure_port_id) VALUES (?, ?, ?, ?, ?)",
      [shipment_id, order_id, shipmentDate, estimatedArrivalDate, departurePortId]
    );

    await connection.commit(); // Commit transaction
    req.session.quoteData = null; // Clear session quote data after placing the order
    res.redirect("/dashboard"); // Redirect to dashboard after successful order
  } catch (error) {
    await connection.rollback(); // Rollback transaction in case of error
    console.error("Error placing order:", error);
    if (error.sqlMessage) {
      console.error("SQL Error:", error.sqlMessage);
    }
    res.status(500).send("An error occurred while placing the order.");
  } finally {
    connection.release(); // Release connection back to the pool
  }
});

// Logout Route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error logging out.");
    }
    res.redirect("/"); // Redirect to home after logout
  });
});

// Start server
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
