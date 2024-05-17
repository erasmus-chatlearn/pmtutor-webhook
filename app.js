const express = require('express');
const { APP_NAME, PORT} = require('./config');
const app = express();
const logResponsePerformance = require('./middlewares/logMiddleware');

app.use(express.json());

// app.use(logResponsePerformance);

const dialogRoutes = require('./routes/webhooks/dialogRoutes');

app.use('/webhooks/dialog', dialogRoutes);

// Catch-all handler for all HTTP methods
app.use((req, res, next) => {
    res.status(404).json({ message: 'Endpoint not found' });
});

app.listen(PORT, async () => {
    console.log(`${APP_NAME} listening on port ${PORT}`)
})
