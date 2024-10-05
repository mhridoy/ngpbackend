const fs = require('fs');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const path = require('path');
const axios = require('axios');
const Papa = require('papaparse');
require('dotenv').config();

// Initialize Firebase Admin SDK
const serviceAccount = require(process.env.FIREBASE_CONFIG_FILE_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://nextgen-programmer.firebaseio.com',
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader =
    req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err);
      return res.status(401).json({ message: 'Failed to authenticate token' });
    }
    req.userId = decoded.id;
    next();
  });
};

// --- Auth & API Endpoints ---

// Login endpoint
app.post('/api/login', (req, res) => {
  console.log('Login attempt:', req.body);
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ id: username }, JWT_SECRET, { expiresIn: '24h' });
    console.log('Login successful, token:', token);
    res.json({ message: 'Login successful', token });
  } else {
    console.log('Invalid credentials');
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Register a new trial class with duplicate check
app.post('/api/trial-class/register', async (req, res) => {
  try {
    const { student_name, age, parents_name, parents_mobile } = req.body;

    // Check for existing registration
    const existingRegistrationQuery = await db
      .collection('registrations')
      .where('student_name', '==', student_name)
      .where('age', '==', age)
      .where('parents_name', '==', parents_name)
      .where('parents_mobile', '==', parents_mobile)
      .get();

    if (!existingRegistrationQuery.empty) {
      return res.status(400).json({ message: 'This registration already exists' });
    }

    const registration = {
      ...req.body,
      registration_date: admin.firestore.Timestamp.now(),
      status: 'PENDING',
    };

    const docRef = await db.collection('registrations').add(registration);
    res.status(201).json({
      message: 'Registration successful',
      registration: { id: docRef.id, ...registration },
    });
  } catch (error) {
    console.error('Error registering:', error);
    res.status(500).json({ message: 'Error registering', error: error.message });
  }
});

// Fetch all trial class registrations
app.get('/api/trial-class/registrations', verifyToken, async (req, res) => {
  try {
    const snapshot = await db
      .collection('registrations')
      .orderBy('registration_date', 'desc')
      .get();
    const registrations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      registration_date: doc
        .data()
        .registration_date.toDate()
        .toISOString(),
    }));
    res.json(registrations);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res
      .status(500)
      .json({ message: 'Error fetching registrations', error: error.message });
  }
});

// Confirm a registration
app.put(
  '/api/trial-class/registrations/:id/confirm',
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      await db.collection('registrations').doc(id).update({ status: 'CONFIRMED' });
      res.json({ message: 'Registration confirmed successfully' });
    } catch (error) {
      console.error('Error confirming registration:', error);
      res
        .status(500)
        .json({ message: 'Error confirming registration', error: error.message });
    }
  }
);



// Utility function to create a slug from the title
const createSlug = (title) => {
  return title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0000-\uFFFF]/g, '')
    .toLowerCase();
};

// --- Dynamic Meta Data for Blog Post ---
app.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    // Fetch blog data from Google Sheets
    const sheetId = '1LCc14doDmZdMUdFFSK475KefRJ2gbcP52cenKE0ZWgE';
    const sheetName = 'Sheet1';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;

    const response = await axios.get(url);
    const csvData = response.data;

    // Parse CSV data
    const parseResult = await new Promise((resolve, reject) => {
      Papa.parse(csvData, {
        header: true,
        complete: (result) => resolve(result),
        error: (error) => reject(error),
      });
    });

    const blogs = parseResult.data.map((row) => ({
      title: row.Title,
      description: row.Descriptions,
      imageUrl: row['Image Link'],
      date: row.Date,
      slug: createSlug(row.Title),
    }));

    // Find the blog post with the matching slug
    const blogData = blogs.find((blog) => blog.slug === slug);

    if (!blogData) {
      // If blog post not found, serve the React app's index.html
      return res.sendFile(path.join(__dirname, 'build', 'index.html'));
    }

    // Read the React app's index.html file
    fs.readFile(path.join(__dirname, 'build', 'index.html'), 'utf8', (err, htmlData) => {
      if (err) {
        console.error('Error reading index.html:', err);
        return res.status(500).send('Internal Server Error');
      }

      // Inject the dynamic Open Graph metadata into the index.html
      htmlData = htmlData
        .replace(
          '<title>NextGen Programmer</title>',
          `<title>${blogData.title}</title>`
        )
        .replace(
          '<meta property="og:title" content="NextGen Programmer - Bangladesh s No.1 Programming School">',
          `<meta property="og:title" content="${blogData.title}">`
        )
        .replace(
          '<meta property="og:description" content="NextGen Programmer is the best coding platform in Bangladesh, empowering young minds through innovative coding education.">',
          `<meta property="og:description" content="${blogData.description}">`
        )
        .replace(
          '<meta property="og:image" content="https://www.nextgenprogrammer.com/images/nextgen-logo.png">',
          `<meta property="og:image" content="${blogData.imageUrl}">`
        )
        .replace(
          '<meta property="og:url" content="https://nextgenprogrammer.com">',
          `<meta property="og:url" content="${req.protocol}://${req.get('host')}${req.originalUrl}">`
        );

      // Send the modified index.html file
      res.send(htmlData);
    });
  } catch (error) {
    console.error('Error fetching blog data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// --- Serve the React App ---
// Serve React build files from /build folder
app.use(express.static(path.join(__dirname, 'build')));

// Catch-all route to serve React app for other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// --- Start the Server ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});