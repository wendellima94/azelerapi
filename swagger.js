// swagger.js
const swaggerJSDoc = require("swagger-jsdoc");

// swagger.js
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Desguaces API",
      version: "1.0.0",
      description: "Documentação da API de Desguaces",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
    components: {
      securitySchemes: {
        basicAuth: {
          type: "http",
          scheme: "basic"
        }
      }
    },
    security: [
      {
        basicAuth: []
      }
    ]
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;