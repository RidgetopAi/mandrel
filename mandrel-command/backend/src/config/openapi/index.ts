/**
 * OpenAPI Configuration for AIDIS Backend API
 * Addresses QA Finding #1: Generate OpenAPI specification and client
 */

import swaggerJSDoc from 'swagger-jsdoc';
import { schemas } from './schemas/index.js';
import { tags } from './tags.js';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AIDIS Command Backend API',
      version: '1.0.0',
      description: 'RESTful API for AIDIS Command Backend with MCP Bridge Integration',
      contact: {
        name: 'AIDIS Development Team',
        email: 'dev@aidis.local'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server'
      },
      {
        url: 'http://localhost:5000/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas
    },
    security: [
      {
        BearerAuth: []
      }
    ],
    tags
  },
  apis: [
    './src/routes/*.ts'
  ]
};

export const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
