import { pgTable, serial, text, timestamp, integer, numeric, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  // NEW: align TS schema with DB so /auth/login can read the hash
  password_hash: text('password_hash'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});


export const listings = pgTable('listings', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  pricePerNight: numeric('price_per_night', { precision: 10, scale: 2 }).notNull(),
  city: text('city').notNull(),
  country: text('country').notNull(),
  beds: integer('beds').notNull(),
  baths: integer('baths').notNull(),
  isInstantBook: boolean('is_instant_book').default(false).notNull(),
  hostId: integer('host_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const photos = pgTable('photos', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').notNull(),
  url: text('url').notNull(),
  alt: text('alt')
});
