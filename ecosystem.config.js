module.exports = {
  apps: [
    {
      name: 'bot-telegram',
      script: 'src/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
    },
  ],
};
