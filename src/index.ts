import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import sampleRoute from './routes/sample';
import cors from "cors"

const app = express();
const port = 3000;

const corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));

// Serve swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Use the routes
app.use('/api', sampleRoute);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
