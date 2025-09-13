// server/drizzle/schema.ts
import { pgTable, serial, integer, boolean, text, varchar, timestamp } from "drizzle-orm/pg-core";
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
