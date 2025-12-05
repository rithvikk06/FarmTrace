import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { triggerValidation } from './validationService';

const app = express();
const port = 3001;

// Middleware
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Endpoint to receive validation requests
app.post('/initiate-validation', async (req, res) => {
  console.log('Received validation request:');
  const { plotId, farmerKey, polygonCoordinates } = req.body;

  if (!plotId || !farmerKey || !polygonCoordinates) {
    return res.status(400).json({ error: 'Missing required fields: plotId, farmerKey, polygonCoordinates' });
  }

  console.log(`- Plot ID: ${plotId}`);
  console.log(`- Farmer Key: ${farmerKey}`);
  console.log(`- Coordinates:`, polygonCoordinates);

  // Save coordinates to a file for the validation service to pick up
  try {
    const coordsDir = path.join(__dirname, '..', 'plot-data');
    await fs.mkdir(coordsDir, { recursive: true });
    const filePath = path.join(coordsDir, `${plotId}.json`);
    await fs.writeFile(filePath, JSON.stringify(polygonCoordinates, null, 2));
    console.log(`Coordinates saved to ${filePath}`);

    // Trigger validation logic in the background (don't await)
    triggerValidation(plotId, farmerKey, polygonCoordinates);

    res.status(200).json({ message: 'Validation process initiated successfully.' });
  } catch (error) {
    console.error('Error saving coordinates:', error);
    res.status(500).json({ error: 'Failed to save coordinates.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Backend is healthy and running.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
