const path = require('path');
const { FILE_FOR_LATEST_ENDPOINT } = require('../../config')
const defaultDialogService = require(`../../services/webhooks/dialog/${FILE_FOR_LATEST_ENDPOINT}`);
const dialogController = {
    useDefaultDialogService: async(req, res) => {
        // console.log(FILE_FOR_LATEST_ENDPOINT);
        try {
            const result = await defaultDialogService.main(req.body);
            return res.json(result);
        } catch (err) {
            console.error(err);
            const httpStatus = err.httpStatus ? err.httpStatus : 500;
            return res.status(httpStatus).json(err);
        }
    },
    handleDynamicDialogService: async (req, res) => {
        const serviceName = req.params.serviceName; // Use the serviceName from the URL parameter

        try {
            // Construct the path to the service dynamically based on serviceName
            const servicePath = path.join(__dirname, `../../services/webhooks/dialog/dialog_${serviceName}.js`);
            const dialogService = await import(servicePath);

            // Check if the dynamically imported service has a main function
            if (typeof dialogService.main === 'function') {
                const result = await dialogService.main(req.body);
                res.json(result);
            } else {
                throw new Error("The service does not export a main function.");
            }
        } catch (err) {
            console.error(err); // Log the error for debugging purposes
            const httpStatus = err.httpStatus ? err.httpStatus : 500;
            res.status(httpStatus).json({ error: "Service handling failed or service not found" });
        }
    }
};
module.exports = dialogController;
