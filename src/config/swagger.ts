import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "MAX Auth API",
      version: "1.0.0",
      description:
        "Authentication and identity platform for the entire MAX ecosystem (MAX AI, MAX Home, MAX Music, MAX Cloud, MAX Browser, MAX OS, MAX Pay, MAX Security, MAX Studio). One MAX Account, every product.",
      contact: { name: "The Tron Forge Limited" },
    },
    servers: [{ url: `${env.APP_URL}/api/v1`, description: env.NODE_ENV }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Authentication" },
      { name: "Profile" },
      { name: "Devices" },
      { name: "Security" },
      { name: "Connected Accounts" },
      { name: "OAuth" },
      { name: "Admin" },
      { name: "Health" },
    ],
  },
  apis: ["./src/routes/*.ts", "./dist/routes/*.js"],
});
