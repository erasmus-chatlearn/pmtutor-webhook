require('dotenv').config();

module.exports = {
    APP_NAME: process.env.APP_NAME,
    PORT: parseInt(process.env.PORT, 10),
    CLOUDANT_URL: process.env.CLOUDANT_URL,
    CLOUDANT_API_KEY: process.env.CLOUDANT_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_ORGANIZATION: process.env.OPENAI_ORGANIZATION,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_MODEL_API: process.env.OPENAI_MODEL_API,
    OPENAI_MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS, 10),
    OPENAI_PROMPT:process.env.OPENAI_PROMPT,
    FILE_FOR_LATEST_ENDPOINT: process.env.FILE_FOR_LATEST_ENDPOINT
};
