import 'dotenv/config';

export const ServerConfig = {
  PORT: parseInt(process.env.PORT || '5174', 10),
};
