// server/drizzle/schema.ts
import { pgTable, serial, integer, boolean, text, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const listings = pgTable("listings", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  city: varchar("city", { length: 80 }).notNull(),
  // price is RM/night in cents to avoid float errors
  priceCents: integer("price_cents").notNull(),
  beds: integer("beds").notNull().default(1),
  baths: integer("baths").notNull().default(1),
  instantBook: boolean("instant_book").notNull().default(false),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const listingsRelations = relations(listings, ({ many }) => ({
  photos: many(photos),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  listing: one(listings, {
    fields: [photos.listingId],
    references: [listings.id],
  }),
}));

// === Auth & Booking Tables ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 160 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 120 }).notNull(),
  name: varchar("name", { length: 120 }),
  role: varchar("role", { length: 16 }).notNull().default("user"), // user | host | admin
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  listingId: integer("listing_id").notNull(),
  checkIn: timestamp("check_in").notNull(),
  checkOut: timestamp("check_out").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"), // pending|confirmed|cancelled|completed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("idx_bookings_user").on(t.userId),
  listingIdx: index("idx_bookings_listing").on(t.listingId),
}));

export const availability = pgTable("availability", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  isAvailable: boolean("is_available").notNull().default(true),
}, (t) => ({
  uniqListingDate: uniqueIndex("uniq_availability_listing_date").on(t.listingId, t.date),
}));

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  provider: varchar("provider", { length: 32 }).notNull().default("manual"),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("MYR"),
  status: varchar("status", { length: 16 }).notNull().default("pending"), // pending|paid|failed|refunded
  ref: varchar("ref", { length: 120 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
}));

export const listingsBookingsRelations = relations(listings, ({ many }) => ({
  bookings: many(bookings),
  availability: many(availability),
}));
