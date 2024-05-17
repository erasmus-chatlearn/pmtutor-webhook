# Erasmus+ ChatLearn PMTutor webhook middleware
This is a Node.js Express middleware for PMTutor to access its IBM Cloudant databases and OpenAI model.

## Features
- Provides PMTutor with needed functions for accessing databases and recommendation
- Access to OpenAI API

## Before Installation
- Copy .env.example and create a .env
- Provide required environment variables in .env

## Installation
```bash
npm install
```

## Running locally
```bash
npm start
```

## Usage example: get all learning topics using the latest webhook
```bash
curl -d '{"action":"getAllTopics"}' -H "Content-Type: application/json" -X POST http://localhost:3000/webhooks/dialog/latest
```

## License
This project is licensed under the MIT License.
