import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import sampleRoute from './routes/sample';

const app = express();
const port = 3000;

// Load the YAML file
const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));

// Serve swagger docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Use the routes
app.use('/api', sampleRoute);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
