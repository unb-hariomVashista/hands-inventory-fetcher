module.exports = {
  apps: [
    {
      name: "shopify-inventory",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 3006,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
