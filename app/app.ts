import express, { Request, Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Serve static files
app.use(express.static(path.join(__dirname, 'static')));

// API endpoint
app.get('/api/hello', (req: Request, res: Response) => {
  res.json({
    message: 'Hello from Node.js Express!',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Node.js Express App'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
