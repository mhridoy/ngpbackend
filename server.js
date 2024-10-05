const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const path = require('path'); // Required for views
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

// Set view engine to EJS (For dynamic metadata templates)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Set views folder for EJS

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  // ... your existing code ...
};

// --- Auth & API Endpoints ---
// ... your existing code ...

// Utility function to create a slug from the title
const createSlug = (title) => {
  return title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0000-\uFFFF]/g, '') // Remove special characters, keep Unicode
    .toLowerCase();
};

// --- Dynamic Meta Data for Blog Post ---
app.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    // Fetch blog data from Google Sheets
    const sheetId = '1LCc14doDmZdMUdFFSK475KefRJ2gbcP52cenKE0ZWgE'; // Your Google Sheet ID
    const sheetName = 'Sheet1'; // The name of the sheet/tab
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
      return res.status(404).send('Blog post not found');
    }

    // Construct the full URL for the blog post
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Render the HTML template with dynamic Open Graph metadata
    res.render('blog-post', {
      title: blogData.title,
      description: blogData.description,
      imageUrl: blogData.imageUrl,
      url: fullUrl,
      fbAppId: process.env.FB_APP_ID || 'YOUR_FB_APP_ID_HERE', // Replace with your Facebook App ID
    });
  } catch (error) {
    console.error('Error fetching blog data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// --- Serve the React App ---
// Serve React build files from /build folder
app.use(express.static(path.join(__dirname, 'build')));

// Catch-all route to serve React app for other routes (for client-side React routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// --- Start the Server ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
