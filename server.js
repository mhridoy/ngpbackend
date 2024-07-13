const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin SDK
const serviceAccount = require(process.env.FIREBASE_CONFIG_FILE_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://nextgen-programmer.firebaseio.com'
});

const db = admin.firestore();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
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

app.post('/api/login', (req, res) => {
  console.log('Login attempt:', req.body);
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password') {
    const token = jwt.sign({ id: username }, JWT_SECRET, { expiresIn: '24h' });
    console.log('Login successful, token:', token);
    res.json({ message: 'Login successful', token });
  } else {
    console.log('Invalid credentials');
    res.status(401).json({ message: 'Invalid credentials' });
  }
});


app.post('/api/trial-class/register', async (req, res) => {
  try {
    const registration = {
      ...req.body,
      registration_date: admin.firestore.Timestamp.now(),
      status: 'PENDING'
    };
    const docRef = await db.collection('registrations').add(registration);
    res.status(201).json({ message: 'Registration successful', registration: { id: docRef.id, ...registration } });
  } catch (error) {
    console.error('Error registering:', error);
    res.status(500).json({ message: 'Error registering', error: error.message });
  }
});

app.get('/api/trial-class/registrations', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('registrations').orderBy('registration_date', 'desc').get();
    const registrations = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      registrations.push({
        id: doc.id,
        ...data,
        registration_date: data.registration_date.toDate().toISOString()
      });
    });
    res.json(registrations);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ message: 'Error fetching registrations', error: error.message });
  }
});

app.put('/api/trial-class/registrations/:id/confirm', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('registrations').doc(id).update({ status: 'CONFIRMED' });
    res.json({ message: 'Registration confirmed successfully' });
  } catch (error) {
    console.error('Error confirming registration:', error);
    res.status(500).json({ message: 'Error confirming registration', error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));