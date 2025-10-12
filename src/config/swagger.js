import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dailey Media API',
      version: '2.1.0',
      description: 'Secure, scalable media storage API for the DAILEY ecosystem',
      contact: {
        name: 'Dailey Software',
        url: 'https://dailey.dev',
        email: 'support@dailey.dev'
      },
      license: {
        name: 'UNLICENSED',
        url: 'https://dailey.dev/license'
      }
    },
    servers: [
      {
        url: 'https://api.dailey.dev',
        description: 'Production server'
      },
      {
        url: 'https://staging-api.dailey.dev',
        description: 'Staging server'
      },
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token from DAILEY CORE authentication'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for programmatic access'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Error type'
            },
            message: {
              type: 'string',
              example: 'Human-readable error message'
            },
            details: {
              type: 'array',
              items: {
                type: 'object'
              },
              description: 'Additional error details (validation errors, etc.)'
            }
          }
        },
        File: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: '1759864690752-346h4d'
            },
            original_filename: {
              type: 'string',
              example: 'photo.jpg'
            },
            mime_type: {
              type: 'string',
              example: 'image/jpeg'
            },
            file_size: {
              type: 'integer',
              example: 1024000
            },
            storage_key: {
              type: 'string',
              example: 'files/user123/bucket456/1759864690752-346h4d.jpg'
            },
            bucket_id: {
              type: 'string',
              example: 'default'
            },
            folder_path: {
              type: 'string',
              example: 'photos/thumbnails'
            },
            uploaded_at: {
              type: 'string',
              format: 'date-time',
              example: '2025-10-12T15:30:00Z'
            },
            metadata: {
              type: 'object',
              properties: {
                width: { type: 'integer' },
                height: { type: 'integer' },
                exif: { type: 'object' }
              }
            },
            access: {
              type: 'string',
              enum: ['public', 'private'],
              example: 'private'
            },
            accessUrl: {
              type: 'string',
              example: 'https://api.dailey.dev/api/serve/files/user123/bucket456/photo.jpg'
            }
          }
        },
        Bucket: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'my-photos'
            },
            name: {
              type: 'string',
              example: 'My Photos'
            },
            description: {
              type: 'string',
              example: 'Personal photo collection'
            },
            is_public: {
              type: 'boolean',
              example: false
            },
            file_count: {
              type: 'integer',
              example: 42
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            },
            updated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'user123'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'key123'
            },
            name: {
              type: 'string',
              example: 'Production API Key'
            },
            key: {
              type: 'string',
              example: 'dmapi_abcd1234efgh5678ijkl'
            },
            scopes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['read', 'write', 'upload', 'admin']
              }
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            },
            last_used: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: 'Authentication required',
                message: 'Please provide a valid authentication token'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: 'Insufficient permissions',
                message: 'You do not have permission to perform this action'
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: 'Validation failed',
                message: 'Invalid input data',
                details: [
                  {
                    field: 'email',
                    message: 'Please provide a valid email address'
                  }
                ]
              }
            }
          }
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: 'Rate limit exceeded',
                message: 'Too many requests from this IP',
                retryAfter: 900
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and system status endpoints'
      },
      {
        name: 'Authentication',
        description: 'Authentication, MFA, and session management'
      },
      {
        name: 'Files',
        description: 'File upload, download, and management'
      },
      {
        name: 'Buckets',
        description: 'Bucket and folder management'
      },
      {
        name: 'Analytics',
        description: 'Usage statistics and analytics'
      },
      {
        name: 'API Keys',
        description: 'API key management'
      },
      {
        name: 'Serve',
        description: 'File serving and public access'
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/middleware/*.js'
  ]
};

export const specs = swaggerJsdoc(options);