const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('/Users/moshiur/Desktop/TNGP/backend/firebase/firebasefile.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://nextgen-programmer.firebaseio.com' // Ensure this is your correct database URL
});

const db = admin.firestore();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const JWT_SECRET = 'your_jwt_secret'; // Change this to a secure random string

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ message: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(500).json({ message: 'Failed to authenticate token' });
    req.userId = decoded.id;
    next();
  });
};

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password') {
    const token = jwt.sign({ id: username }, JWT_SECRET, { expiresIn: 86400 }); // 24 hours
    res.json({ message: 'Login successful', token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/trial-class/register', async (req, res) => {
  try {
    const registration = req.body;
    const docRef = await db.collection('registrations').add(registration);
    res.status(201).json({ message: 'Registration successful', registration: { id: docRef.id, ...registration } });
  } catch (error) {
    res.status(500).json({ message: 'Error registering', error });
  }
});

app.get('/trial-class/registrations', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('registrations').get();
    const registrations = [];
    snapshot.forEach(doc => {
      registrations.push({ id: doc.id, ...doc.data() });
    });
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching registrations', error });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
