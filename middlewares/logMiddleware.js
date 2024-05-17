const logResponsePerformance = (req, res, next) => {
    const start = process.hrtime();
    const currentDatetime = new Date();
    // Format the timestamp into a human-readable format
    const formattedDate = currentDatetime.toLocaleString(); // You can customize this format

    res.on('finish', () => {
        const duration = process.hrtime(start);
        const responseTimeInMs = (duration[0] * 1000 + duration[1] / 1e6).toFixed(2);
        let logMessage = `[${formattedDate}] ${req.method} ${req.originalUrl} [${res.statusCode}] - ${responseTimeInMs} ms`;

        // Check if the method is POST, and if there's a body and an action property
        if (req.method === "POST" && req.body && req.body.action) {
            logMessage += ` - Action: ${req.body.action}`;
        } else if (req.method === "POST") {
            // Handle POST requests with no body or no action property specifically
            logMessage += ` - Action: Not provided or missing in request body`;
        }

        console.log(logMessage);
    });

    next();
};

module.exports = logResponsePerformance;
