// The contract between the app (and the bot players) and the backend: generated database
// types, the answers each function gives, and the Realtime events. One wrapper per `api`
// function lands here with roadmap M3.6.
export * from './answers';
export type { Database, Json } from './database.types';
export * from './realtime';
